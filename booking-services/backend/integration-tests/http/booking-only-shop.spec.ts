import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import seed from "../../src/scripts/seed"
import seedBookingDemo, { BOOKING_KIND_CATEGORIES } from "../../src/scripts/seed-booking-demo"

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
        expect(products.products.map((p: { handle: string }) => p.handle).sort()).toEqual(["haircut", "table-reservation"])

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
          ["appointments", ["haircut"]],
          ["table-reservations", ["table-reservation"]],
        ])
        expect(BOOKING_KIND_CATEGORIES.map((c) => c.kind)).toEqual(["A", "G"])
      })

      it("has no Europe region, warehouse or shipping for goods beyond the Cambodia seed", async () => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data: regions } = await query.graph({ entity: "region", fields: ["name", "currency_code"] })
        expect(regions).toEqual([expect.objectContaining({ name: "Cambodia", currency_code: "usd" })])
        const { data: locations } = await query.graph({ entity: "stock_location", fields: ["name"] })
        expect(locations.map((l) => l.name)).not.toContain("European Warehouse")
        const { data: categories } = await query.graph({ entity: "product_category", fields: ["handle"] })
        expect(categories.map((c) => c.handle).sort()).toEqual(["appointments", "table-reservations"])
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
        expect(before).toEqual({ products: 2, categories: 2, variants: 5 })
      })
    })
  },
})
