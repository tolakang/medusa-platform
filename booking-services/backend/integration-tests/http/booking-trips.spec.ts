import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import {
  TRIP_ADDRESSES_MESSAGE,
  TRIP_HOURS_MESSAGE,
  TRIP_LENGTH_MESSAGE,
  TRIP_ZONES_MESSAGE,
} from "../../src/workflows/add-booking-to-cart"
import { SAME_ZONE_MESSAGE } from "../../src/workflows/trip-zones"

jest.setTimeout(240 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()
// 08:00 Phnom Penh (UTC+7) on that Monday, plus minutes.
const at = (minutes: number) => new Date(Date.parse(`${monday}T01:00:00.000Z`) + minutes * 60_000).toISOString()

// TASKS P3-21 (plan §9.3 kind C, D12): a trip from a pickup to a drop-off
// with a vehicle size, priced by the hour or by zones. The backend sets the
// price and checks the length; the customer's request only chooses.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("trips (TASKS P3-21)", () => {
      let store: { headers: Record<string, string> }
      let admin: { headers: Record<string, string> }
      let regionId: string
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
      const call = (request: Promise<any>) =>
        request.then(
          (r) => r,
          (e) => e.response
        )
      const variant = async (handle: string, title: string) => {
        const {
          data: [product],
        } = await query().graph({ entity: "product", fields: ["variants.id", "variants.title"], filters: { handle } })
        return product.variants!.find((v) => v!.title === title)!.id
      }
      const newCart = async () => (await api.post("/store/carts", { region_id: regionId, email: "sok@example.com" }, store)).data.cart.id as string
      const resourceOf = async (variantId: string) => {
        const { data } = await query().graph({ entity: "product_variant", fields: ["booking_resources.id"], filters: { id: variantId } })
        return (data[0] as unknown as { booking_resources: { id: string }[] }).booking_resources[0].id
      }
      const addresses = { address: "#12, St 310, Siem Reap", dropoff_address: "Sala Kamreuk village, house 5" }

      beforeEach(async () => {
        const container = getContainer()
        process.env.BOOKING_DEFAULT_TIMEZONE = "Asia/Phnom_Penh"
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seed({ container })
        await seedBookingDemo({ container })
        const {
          data: [key],
        } = await query().graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        store = { headers: { "x-publishable-api-key": key.token } }
        regionId = (await query().graph({ entity: "region", fields: ["id"] })).data[0].id
        const email = "admin@booking.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        admin = { headers: { authorization: `Bearer ${(await api.post("/auth/user/emailpass", { email, password: "supersecret1" })).data.token}` } }
      })

      it("by the hour: whole hours from the vehicle's minimum, priced hours × the hourly price", async () => {
        const large = await variant("moving-truck", "Large truck")
        const resource = await resourceOf(large)
        // 3-hour slots for the large truck (its minimum).
        const slots = (await api.get(`/store/booking/slots?variant_id=${large}&date=${monday}&duration_minutes=180`, store)).data.slots
        expect(slots[0].resource_name).toBe("Large truck")
        expect(Date.parse(slots[0].ends_at) - Date.parse(slots[0].starts_at)).toBe(3 * 3600_000)
        const cart = await newCart()
        const add = (extra: Record<string, unknown>) =>
          call(api.post("/store/booking/cart", { cart_id: cart, variant_id: large, resource_id: resource, starts_at: at(0), ends_at: at(180), ...extra }, store))

        expect((await add({ hours: 3 })).data.message).toBe(TRIP_ADDRESSES_MESSAGE)
        expect((await add({ ...addresses })).data.message).toBe(TRIP_HOURS_MESSAGE)
        expect((await add({ ...addresses, hours: 2 })).data.message).toBe(TRIP_HOURS_MESSAGE)
        // The length must match the hours asked for.
        expect((await add({ ...addresses, hours: 4 })).data.message).toBe(TRIP_LENGTH_MESSAGE)
        expect(await booking().listBookings({ resource_id: resource })).toEqual([])

        const ok = await add({ ...addresses, hours: 3 })
        expect(ok.status).toBe(200)
        const { data } = await api.get(`/store/carts/${cart}`, store)
        const item = data.cart.items[0]
        expect([item.title, item.unit_price]).toEqual(["Moving truck", 75])
        // Kept as a custom price, so refreshing the cart doesn't re-price it.
        const [line] = await getContainer().resolve(Modules.CART).listLineItems({ id: item.id })
        expect(line.is_custom_price).toBe(true)
        await api.post(`/store/carts/${cart}`, { email: "dara@example.com" }, store)
        expect((await api.get(`/store/carts/${cart}`, store)).data.cart.items[0].unit_price).toBe(75)
        expect(item.metadata).toMatchObject({ booking_trip: "3 hours", booking_address: addresses.address, booking_dropoff_address: addresses.dropoff_address })
        const [held] = await booking().listBookings({ id: ok.data.booking.id })
        expect([held.address, held.dropoff_address]).toEqual([addresses.address, addresses.dropoff_address])
        // A price sent by the customer is never taken.
        const tricked = await call(
          api.post("/store/booking/cart", { cart_id: cart, variant_id: large, resource_id: resource, starts_at: at(240), ends_at: at(420), ...addresses, hours: 3, unit_price: 1 }, store)
        )
        expect(tricked.status).toBe(400)
      })

      it("by zones: the table's price and length, either way round, and nothing for a missing pair", async () => {
        const van = await variant("airport-transfer", "Van (up to 10)")
        const resource = await resourceOf(van)
        const { data } = await api.get(`/store/booking/zones?variant_id=${van}`, store)
        expect(data.zones.map((z: any) => z.name)).toEqual(["Siem Reap town", "Airport", "Angkor temples"])
        const zone = (name: string) => data.zones.find((z: any) => z.name === name).id
        expect(data.prices.find((p: any) => [p.from_zone_id, p.to_zone_id].sort().join() === [zone("Airport"), zone("Angkor temples")].sort().join())).toMatchObject({ amount: 36, minutes: 90, currency_code: "usd" })

        const cart = await newCart()
        const add = (from: string, to: string, minutes: number, start = 0) =>
          call(
            api.post(
              "/store/booking/cart",
              { cart_id: cart, variant_id: van, resource_id: resource, starts_at: at(start), ends_at: at(start + minutes), ...addresses, from_zone_id: zone(from), to_zone_id: zone(to) },
              store
            )
          )
        expect((await add("Airport", "Angkor temples", 60)).data.message).toBe(TRIP_LENGTH_MESSAGE)
        // Airport → town is the town → airport price ($24 with the van).
        const ok = await add("Airport", "Siem Reap town", 60)
        expect(ok.status).toBe(200)
        const item = (await api.get(`/store/carts/${cart}`, store)).data.cart.items[0]
        expect([item.unit_price, item.metadata.booking_trip]).toEqual([24, "Airport → Siem Reap town"])

        // No price for a pair the table doesn't have.
        const lonely = (await call(api.post("/admin/booking/zones", { name: "Phnom Penh" }, admin))).data.zone
        const none = await call(
          api.post(
            "/store/booking/cart",
            { cart_id: cart, variant_id: van, resource_id: resource, starts_at: at(120), ends_at: at(180), ...addresses, from_zone_id: lonely.id, to_zone_id: zone("Airport") },
            store
          )
        )
        expect(none.data.message).toBe(TRIP_ZONES_MESSAGE)
      })

      it("the admin manages zones and the price table", async () => {
        const car = await variant("airport-transfer", "Car (up to 3)")
        const pp = (await call(api.post("/admin/booking/zones", { name: "Phnom Penh", rank: 5 }, admin))).data.zone
        expect((await call(api.post("/admin/booking/zones", { name: "Phnom Penh" }, admin))).status).toBe(422)
        const { data } = await api.get("/admin/booking/zones", admin)
        const town = data.zones.find((z: any) => z.name === "Siem Reap town").id
        expect((await call(api.post("/admin/booking/zone-prices", { variant_id: car, from_zone_id: town, to_zone_id: town, amount: 1, minutes: 30, currency_code: "usd" }, admin))).data.message).toBe(SAME_ZONE_MESSAGE)
        const set = await call(api.post("/admin/booking/zone-prices", { variant_id: car, from_zone_id: pp.id, to_zone_id: town, amount: 60, minutes: 360, currency_code: "usd" }, admin))
        expect(set.status).toBe(200)
        // Setting the same pair the other way round changes that row.
        const again = await call(api.post("/admin/booking/zone-prices", { variant_id: car, from_zone_id: town, to_zone_id: pp.id, amount: 55, minutes: 330, currency_code: "usd" }, admin))
        expect(again.data.price.id).toBe(set.data.price.id)
        const shop = (await api.get(`/store/booking/zones?variant_id=${car}`, store)).data
        expect(shop.prices.filter((p: any) => [p.from_zone_id, p.to_zone_id].includes(pp.id))).toEqual([
          expect.objectContaining({ amount: 55, minutes: 330 }),
        ])
        // Deleting a zone takes its prices along.
        await api.delete(`/admin/booking/zones/${pp.id}`, admin)
        const after = (await api.get(`/store/booking/zones?variant_id=${car}`, store)).data
        expect(after.zones.map((z: any) => z.name)).not.toContain("Phnom Penh")
        expect(after.prices).toHaveLength(3)
      })
    })
  },
})
