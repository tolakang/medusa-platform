import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import { BALANCE_METADATA_KEY, BALANCE_TEMPLATE } from "../../src/lib/deposits"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import { sendBalanceRemindersWorkflow } from "../../src/workflows/send-balance-reminders"

jest.setTimeout(240 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()
const at = (minutes: number) => new Date(Date.parse(`${monday}T01:00:00.000Z`) + minutes * 60_000).toISOString()

// TASKS P3-26 (owner, 2026-11-17: a percent per service, the balance at the
// shop or venue): checkout charges the deposit, the order keeps the rest as
// an outstanding payment collection staff mark paid, and the customer gets
// one reminder before the booking.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("deposit and balance (TASKS P3-26)", () => {
      let store: { headers: Record<string, string> }
      let admin: { headers: Record<string, string> }
      let regionId: string
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const call = (request: Promise<any>) =>
        request.then(
          (r) => r,
          (e) => e.response
        )
      const truck = async () => {
        const {
          data: [product],
        } = await query().graph({
          entity: "product",
          fields: ["variants.id", "variants.title", "variants.booking_resources.id"],
          filters: { handle: "moving-truck" },
        })
        const v = product.variants!.find((x) => x!.title === "Small truck")! as unknown as { id: string; booking_resources: { id: string }[] }
        return { id: v.id, resource: v.booking_resources[0].id }
      }
      const checkout = async (book: (cart: string) => Promise<unknown>) => {
        const cart = (await api.post("/store/carts", { region_id: regionId, email: "sok@example.com" }, store)).data.cart.id
        await book(cart)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, store)
        const session = await api.post(
          `/store/payment-collections/${payment_collection.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          store
        )
        const done = await call(api.post(`/store/carts/${cart}/complete`, {}, store))
        return { session: session.data.payment_collection, done }
      }
      const bookTruck = async (cart: string) => {
        const t = await truck()
        return api.post(
          "/store/booking/cart",
          {
            cart_id: cart,
            variant_id: t.id,
            resource_id: t.resource,
            starts_at: at(0),
            ends_at: at(120),
            address: "#12, St 310, Siem Reap",
            dropoff_address: "Wat Bo village, house 8",
            hours: 2,
          },
          store
        )
      }
      const balanceOf = async (orderId: string) => {
        let found: any = null
        for (let i = 0; i < 40 && !found; i++) {
          const { data } = await query().graph({
            entity: "order",
            fields: ["id", "total", "payment_collections.id", "payment_collections.amount", "payment_collections.status", "payment_collections.metadata"],
            filters: { id: orderId },
          })
          found = (data[0].payment_collections ?? []).find((c: any) => c?.metadata?.[BALANCE_METADATA_KEY])
          if (!found) await new Promise((r) => setTimeout(r, 250))
        }
        return found
      }

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

      it("charges the deposit at checkout and keeps the balance on the order", async () => {
        const { session, done } = await checkout(bookTruck)
        // 2 hours of the small truck = $30; 30% now.
        expect(Number(session.amount)).toBe(9)
        expect(session.payment_sessions[0].amount).toBe(9)
        expect([done.data.type, done.data.order.total]).toEqual(["order", 30])
        const balance = await balanceOf(done.data.order.id)
        expect([Number(balance.amount), balance.status, balance.metadata.due_at]).toEqual([21, "not_paid", at(0)])

        // Staff take the balance at the venue: "Mark as paid".
        const paid = await call(
          api.post(`/admin/payment-collections/${balance.id}/mark-as-paid`, { order_id: done.data.order.id }, admin)
        )
        expect(paid.status).toBe(200)
        expect((await balanceOf(done.data.order.id)).status).toBe("completed")
      })

      it("leaves a cart without deposit services at its full total, with no balance", async () => {
        const {
          data: [product],
        } = await query().graph({
          entity: "product",
          fields: ["variants.id", "variants.title", "variants.booking_resources.id"],
          filters: { handle: "haircut" },
        })
        const v = product.variants!.find((x) => x!.title === "30 min")! as unknown as { id: string; booking_resources: { id: string }[] }
        const slots = (await api.get(`/store/booking/slots?variant_id=${v.id}&date=${monday}`, store)).data.slots
        const { session, done } = await checkout((cart) =>
          api.post(
            "/store/booking/cart",
            { cart_id: cart, variant_id: v.id, resource_id: slots[0].resource_id, starts_at: slots[0].starts_at, ends_at: slots[0].ends_at },
            store
          )
        )
        expect(Number(session.amount)).toBe(8)
        expect(done.data.order.total).toBe(8)
        await new Promise((r) => setTimeout(r, 1500))
        const { data } = await query().graph({ entity: "order", fields: ["payment_collections.id"], filters: { id: done.data.order.id } })
        expect(data[0].payment_collections).toHaveLength(1)
      })

      it("reminds once before the booking, and not after the balance is paid", async () => {
        const { done } = await checkout(bookTruck)
        const balance = await balanceOf(done.data.order.id)
        const dayBefore = new Date(Date.parse(at(0)) - 24 * 3600_000).toISOString()
        const weekBefore = new Date(Date.parse(at(0)) - 7 * 24 * 3600_000).toISOString()
        expect((await sendBalanceRemindersWorkflow(getContainer()).run({ input: { now: weekBefore } })).result).toEqual([])
        const first = await sendBalanceRemindersWorkflow(getContainer()).run({ input: { now: dayBefore } })
        expect(first.result.map((r) => [r.email, r.data.amount])).toEqual([["sok@example.com", 21]])
        expect((await sendBalanceRemindersWorkflow(getContainer()).run({ input: { now: dayBefore } })).result).toEqual([])
        const { data: sent } = await query().graph({ entity: "notification", fields: ["to"], filters: { template: BALANCE_TEMPLATE } })
        expect(sent).toHaveLength(1)

        // A second order, paid at once: no reminder.
        const second = await checkout(async (cart) => {
          const t = await truck()
          return api.post(
            "/store/booking/cart",
            { cart_id: cart, variant_id: t.id, resource_id: t.resource, starts_at: at(240), ends_at: at(360), address: "#12, St 310, Siem Reap", dropoff_address: "Wat Bo village, house 8", hours: 2 },
            store
          )
        })
        const other = await balanceOf(second.done.data.order.id)
        await api.post(`/admin/payment-collections/${other.id}/mark-as-paid`, { order_id: second.done.data.order.id }, admin)
        expect((await sendBalanceRemindersWorkflow(getContainer()).run({ input: { now: dayBefore } })).result).toEqual([])
        expect(balance.id).not.toBe(other.id)
      })
    })
  },
})
