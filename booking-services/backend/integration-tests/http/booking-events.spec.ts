import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import { EVENT_TICKETS_TEMPLATE } from "../../src/lib/event-tickets"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import { TICKET_USED_MESSAGE } from "../../src/workflows/use-event-ticket"

jest.setTimeout(240 * 1000)

// TASKS P3-24 (plan §9.3 kind F, by section, owner 2026-11-17): event
// tickets are variants per date and section whose inventory is the seats; a
// placed order issues one ticket with a code per unit and emails them; the
// admin lets a ticket in once.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("event tickets (TASKS P3-24)", () => {
      let store: { headers: Record<string, string> }
      let admin: { headers: Record<string, string> }
      let regionId: string
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const call = (request: Promise<any>) =>
        request.then(
          (r) => r,
          (e) => e.response
        )
      const vip = async () => {
        const { data } = await api.get(`/store/products?handle=apsara-dance-show&region_id=${regionId}&fields=*variants,+variants.inventory_quantity,+variants.metadata`, store)
        return data.products[0].variants.find((v: any) => v.title.endsWith("VIP")) as { id: string; inventory_quantity: number; metadata: Record<string, unknown> }
      }
      const order = async (variantId: string, quantity: number) => {
        const cart = (await api.post("/store/carts", { region_id: regionId, email: "sok@example.com" }, store)).data.cart.id
        const added = await call(api.post(`/store/carts/${cart}/line-items`, { variant_id: variantId, quantity }, store))
        if (added.status !== 200) {
          return { added }
        }
        // A guest's contact name, as the checkout sets it on the billing address.
        await api.post(`/store/carts/${cart}`, { billing_address: { first_name: "Sok", last_name: "Chan", country_code: "kh" } }, store)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, store)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, store)
        const done = await call(api.post(`/store/carts/${cart}/complete`, {}, store))
        return { added, done }
      }
      const ticketsOf = async (orderId: string, count: number) => {
        let tickets: any[] = []
        for (let i = 0; i < 40 && tickets.length < count; i++) {
          tickets = (await api.get(`/store/booking/tickets?order_id=${orderId}`, store)).data.tickets
          if (tickets.length < count) await new Promise((r) => setTimeout(r, 250))
        }
        return tickets
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

      it("sells tickets with no shipping, issues one code per ticket and emails them", async () => {
        const seats = await vip()
        expect(seats.inventory_quantity).toBe(20)
        expect(typeof seats.metadata.event_starts_at).toBe("string")
        const { done } = await order(seats.id, 2)
        expect([done!.data.type, done!.data.order.total, done!.data.order.shipping_methods ?? []]).toEqual(["order", 60, []])
        const tickets = await ticketsOf(done!.data.order.id, 2)
        expect(tickets).toHaveLength(2)
        expect(new Set(tickets.map((t: any) => t.code)).size).toBe(2)
        expect(tickets[0]).toMatchObject({ event_title: "Apsara dance show", status: "valid" })
        expect(tickets[0].label).toMatch(/VIP$/)
        // The seats are reserved by Medusa's own inventory.
        expect((await vip()).inventory_quantity).toBe(18)

        // One email with every code.
        const { data: sent } = await query().graph({
          entity: "notification",
          fields: ["to", "data"],
          filters: { template: EVENT_TICKETS_TEMPLATE },
        })
        expect(sent).toHaveLength(1)
        expect(sent[0].to).toBe("sok@example.com")
        // A guest is greeted by the checkout name (P3-24 follow-up).
        expect((sent[0].data as any).customer_name).toBe("Sok Chan")
        expect(((sent[0].data as any).tickets as any[]).map((t) => t.code).sort()).toEqual(tickets.map((t: any) => t.code).sort())
      })

      it("sells extras with a group of tickets, never on their own (P3-25 follow-up)", async () => {
        const {
          data: [helper],
        } = await query().graph({ entity: "product", fields: ["variants.id"], filters: { handle: "extra-helper" } })
        const extra = helper.variants![0]!.id
        const cart = (await api.post("/store/carts", { region_id: regionId, email: "sok@example.com" }, store)).data.cart.id
        const lone = await call(api.post(`/store/carts/${cart}/line-items`, { variant_id: extra, quantity: 1, metadata: { booking_extra_for: "tkt_nope" } }, store))
        expect(lone.status).toBe(400)
        await api.post(`/store/carts/${cart}/line-items`, { variant_id: (await vip()).id, quantity: 2, metadata: { booking_ticket_group: "tkt_g1" } }, store)
        const ok = await call(api.post(`/store/carts/${cart}/line-items`, { variant_id: extra, quantity: 1, metadata: { booking_extra_for: "tkt_g1" } }, store))
        expect(ok.status).toBe(200)
        expect(ok.data.cart.items).toHaveLength(2)
      })

      it("lets a ticket in once at the door, however the code is typed", async () => {
        const { done } = await order((await vip()).id, 1)
        const [ticket] = await ticketsOf(done!.data.order.id, 1)
        const typed = ticket.code.toLowerCase().replace(/-/g, " ")
        const found = await call(api.get(`/admin/booking/tickets/${encodeURIComponent(typed)}`, admin))
        expect(found.data.ticket).toMatchObject({ code: ticket.code, status: "valid" })
        const used = await call(api.post(`/admin/booking/tickets/${ticket.code}/use`, {}, admin))
        expect(used.data.ticket.status).toBe("used")
        const again = await call(api.post(`/admin/booking/tickets/${ticket.code}/use`, {}, admin))
        expect(again.status).toBe(400)
        expect(again.data.message).toContain(TICKET_USED_MESSAGE)
        expect((await call(api.get("/admin/booking/tickets/AAAA-AAAA-AA", admin))).status).toBe(404)
        // The store route needs an order id and isn't an admin lookup.
        expect((await call(api.get("/store/booking/tickets", store))).status).toBe(400)
      })

      it("never sells more tickets than the section has seats", async () => {
        const seats = await vip()
        const { added } = await order(seats.id, 21)
        expect(added.status).toBeGreaterThanOrEqual(400)
        expect((await order(seats.id, 20)).done!.data.type).toBe("order")
        expect((await order(seats.id, 1)).added.status).toBeGreaterThanOrEqual(400)
      })
    })
  },
})
