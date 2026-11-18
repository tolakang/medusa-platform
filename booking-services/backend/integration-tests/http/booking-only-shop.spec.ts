import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import seed from "../../src/scripts/seed"
import seedBookingDemo, { BOOKING_KIND_CATEGORIES } from "../../src/scripts/seed-booking-demo"
import { listCalendarBookings } from "../../src/api/booking-calendar"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import { VISIT_ADDRESS_MESSAGE, VISIT_PROBLEM_MESSAGE } from "../../src/workflows/add-booking-to-cart"

// TASKS P3-19 (plan §9.3 "Booking-only shop", F-087): the staging data is the
// Cambodia seed plus the booking demo seed, nothing else: one service per
// booking kind (A appointment, G table reservation), each in its kind's
// category, no demo goods, no Europe region or warehouse.
jest.setTimeout(240 * 1000)

// The next Monday at least 7 days ahead.
const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("booking-only shop data (TASKS P3-19)", () => {
      let store: { headers: Record<string, string> }

      beforeEach(async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        process.env.BOOKING_DEFAULT_TIMEZONE = "Asia/Phnom_Penh"
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seed({ container })
        await seedBookingDemo({ container })
        const {
          data: [key],
        } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        store = { headers: { "x-publishable-api-key": key.token } }
      })

      it("sells only the booking services, one per kind, each in its kind's category", async () => {
        const { data: products } = await api.get("/store/products?fields=handle,categories.handle", store)
        expect(products.products.map((p: { handle: string }) => p.handle).sort()).toEqual(["air-conditioner-service", "airport-transfer", "angkor-sunrise-tour", "apsara-dance-show", "bus-siem-reap-phnom-penh", "extra-helper", "full-house-move", "guesthouse-room", "haircut", "haircut-5-pack", "moving-insurance", "moving-truck", "packing-boxes", "table-reservation", "wedding-tent"])

        // As the storefront reads them: the kinds by rank, then each kind's
        // services through /store/products?category_id=.
        const { data: categories } = await api.get("/store/product-categories?fields=id,handle,name,rank&order=rank", store)
        const byKind = await Promise.all(
          categories.product_categories.map(async (c: { id: string; handle: string }) => {
            const { data } = await api.get(`/store/products?category_id[]=${c.id}&fields=handle`, store)
            return [c.handle, data.products.map((p: { handle: string }) => p.handle)]
          })
        )
        expect(byKind).toEqual([
          ["appointments", expect.arrayContaining(["haircut", "full-house-move"])],
          ["home-visits", ["air-conditioner-service"]],
          ["trips", expect.arrayContaining(["airport-transfer", "moving-truck"])],
          ["departures", expect.arrayContaining(["angkor-sunrise-tour", "bus-siem-reap-phnom-penh"])],
          ["rentals", expect.arrayContaining(["guesthouse-room", "wedding-tent"])],
          ["events", ["apsara-dance-show"]],
          ["table-reservations", ["table-reservation"]],
        ])
        expect(BOOKING_KIND_CATEGORIES.map((c) => c.kind)).toEqual(["A", "B", "C", "D", "E", "F", "G"])
      })

      it("a visit at your place needs the address and the problem, and the calendar shows them (P3-20)", async () => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const {
          data: [service],
        } = await query.graph({
          entity: "product",
          fields: ["metadata", "variants.id", "variants.sku", "variants.metadata"],
          filters: { handle: "air-conditioner-service" },
        })
        expect(service.metadata).toEqual({ booking_kind: "B" })
        const repair = service.variants!.find((v) => v!.sku === "AC-REPAIR")!
        expect(repair.metadata).toEqual({ duration_minutes: 90 })
        const { data } = await api.get(`/store/booking/slots?variant_id=${repair.id}&date=${monday}`, store)
        // 08:00-12:00 and 13:00-17:00 in 90-minute visits with Vannak.
        expect(data.slots.map((s: any) => [s.resource_name, s.starts_at.slice(11, 16)])).toEqual([
          ["Vannak", "01:00"],
          ["Vannak", "02:30"],
          ["Vannak", "06:00"],
          ["Vannak", "07:30"],
        ])
        const regionId = (await query.graph({ entity: "region", fields: ["id"] })).data[0].id
        const cart = (await api.post("/store/carts", { region_id: regionId, email: "sok@example.com" }, store)).data.cart
        const slot = data.slots[0]
        const body = { cart_id: cart.id, variant_id: repair.id, resource_id: slot.resource_id, starts_at: slot.starts_at, ends_at: slot.ends_at }
        const add = (extra: Record<string, unknown>) =>
          api.post("/store/booking/cart", { ...body, ...extra }, store).then(
            (r) => r,
            (e) => e.response
          )
        expect((await add({})).data.message).toBe(VISIT_ADDRESS_MESSAGE)
        expect((await add({ address: " #1 ", notes: "Leaks" })).data.message).toBe(VISIT_ADDRESS_MESSAGE)
        expect((await add({ address: "#12, St 310, Siem Reap" })).data.message).toBe(VISIT_PROBLEM_MESSAGE)
        // A refused try holds nothing.
        const booking = getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
        expect(await booking.listBookings({ resource_id: slot.resource_id })).toEqual([])

        const added = await add({ address: "  #12, St 310, Siem Reap ", notes: "The unit leaks water." })
        expect(added.status).toBe(200)
        const [held] = await booking.listBookings({ id: added.data.booking.id })
        expect([held.address, held.notes]).toEqual(["#12, St 310, Siem Reap", "The unit leaks water."])
        // The calendar the admin and the provider portal read carries both.
        const calendar = await listCalendarBookings(getContainer(), {
          resource_ids: [slot.resource_id],
          from: `${monday}T00:00:00.000Z`,
          to: `${monday}T23:00:00.000Z`,
        })
        // (The generated query types gain `address` on the next dev run.)
        expect(calendar.map((b) => [(b as { address?: string | null }).address, b.notes])).toEqual([["#12, St 310, Siem Reap", "The unit leaks water."]])

        // An appointment (kind A) takes no address even when one is sent.
        const {
          data: [haircut],
        } = await query.graph({ entity: "product", fields: ["variants.id", "variants.sku"], filters: { handle: "haircut" } })
        const cut = haircut.variants!.find((v) => v!.sku === "HAIRCUT-30")!
        const cutSlots = (await api.get(`/store/booking/slots?variant_id=${cut.id}&date=${monday}`, store)).data.slots
        const plain = await api.post(
          "/store/booking/cart",
          { cart_id: cart.id, variant_id: cut.id, resource_id: cutSlots[0].resource_id, starts_at: cutSlots[0].starts_at, ends_at: cutSlots[0].ends_at, address: "Somewhere" },
          store
        )
        expect((await booking.listBookings({ id: plain.data.booking.id }))[0].address).toBeNull()
      })

      it("has no Europe region, warehouse or shipping for goods beyond the Cambodia seed", async () => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data: regions } = await query.graph({ entity: "region", fields: ["name", "currency_code"] })
        expect(regions).toEqual([expect.objectContaining({ name: "Cambodia", currency_code: "usd" })])
        const { data: locations } = await query.graph({ entity: "stock_location", fields: ["name"] })
        expect(locations.map((l) => l.name)).not.toContain("European Warehouse")
        const { data: categories } = await query.graph({ entity: "product_category", fields: ["handle"] })
        expect(categories.map((c) => c.handle).sort()).toEqual(["appointments", "departures", "events", "home-visits", "rentals", "table-reservations", "trips"])
      })

      it("books a table by party size: one table of that size per booking", async () => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data: variants } = await query.graph({
          entity: "product_variant",
          fields: ["id", "title", "metadata", "booking_resources.name", "booking_resources.capacity"],
          filters: { sku: ["TABLE-2", "TABLE-4", "TABLE-6"] },
        })
        expect(
          variants
            .map((v) => [
              v.title,
              (v.metadata as Record<string, unknown>).party_size,
              (v.booking_resources ?? []).map((r) => [r!.name, r!.capacity]),
            ])
            .sort()
        ).toEqual([
          ["2 people", 2, [["Tables for 2", 4]]],
          ["4 people", 4, [["Tables for 4", 3]]],
          ["6 people", 6, [["Table for 6", 1]]],
        ])

        // 90-minute slots inside 11:00-14:00 and 17:00-22:00 Phnom Penh time
        // (UTC+7): 11:00, 12:30, 17:00, 18:30, 20:00; each with every table free.
        const four = variants.find((v) => v.title === "4 people")!
        const { data } = await api.get(`/store/booking/slots?variant_id=${four.id}&date=${monday}`, store)
        expect(data.duration_minutes).toEqual(90)
        expect(data.slots.map((s: { starts_at: string }) => s.starts_at.slice(11, 16))).toEqual([
          "04:00",
          "05:30",
          "10:00",
          "11:30",
          "13:00",
        ])
        expect(new Set(data.slots.map((s: { remaining: number }) => s.remaining))).toEqual(new Set([3]))
      })

      it("can be run again without adding anything", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const count = async () => ({
          products: (await query.graph({ entity: "product", fields: ["id"] })).data.length,
          categories: (await query.graph({ entity: "product_category", fields: ["id"] })).data.length,
          variants: (await query.graph({ entity: "product_variant", fields: ["id"] })).data.length,
        })
        const before = await count()
        await seedBookingDemo({ container })
        expect(await count()).toEqual(before)
        expect(before).toEqual({ products: 15, categories: 7, variants: 26 })
      })
    })
  },
})
