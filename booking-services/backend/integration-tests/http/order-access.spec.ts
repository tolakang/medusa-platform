import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow } from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import { ORDER_ACCESS_HEADER, signOrderAccess } from "@medusa-platform/medusa-core/api/order-access"

// GET /store/orders/:id shows name, address and phone, so only the customer who
// owns the order or the browser that placed it (signed proof the storefront
// forwards as x-order-access) may read it; everyone else gets 404
// (packages/medusa-core/src/api/order-access.ts). Customer tokens as in the
// admin JWT pattern of checkout-acceptance.spec.ts (default test secret).
const SECRET = "test_order_access_secret"
process.env.ORDER_ACCESS_SECRET = SECRET
jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Store order access", () => {
      const setup = async () => {
        const container = getContainer()
        await createDefaultsWorkflow(container).run()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const {
          data: [key],
        } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        const pk = { "x-publishable-api-key": key.token }

        const customers = container.resolve(Modules.CUSTOMER)
        const auth = container.resolve(Modules.AUTH)
        const tokenFor = async (email: string) => {
          const customer = await customers.createCustomers({ email, has_account: true })
          const identity = await auth.createAuthIdentities({
            provider_identities: [{ provider: "emailpass", entity_id: email }],
            app_metadata: { customer_id: customer.id },
          })
          const token = jwt.sign(
            { actor_id: customer.id, actor_type: "customer", auth_identity_id: identity.id },
            "supersecret",
            { expiresIn: "1d" }
          )
          return { customer, headers: { ...pk, authorization: `Bearer ${token}` } }
        }
        const owner = await tokenFor("owner@example.com")
        const other = await tokenFor("other@example.com")

        const [order] = await container.resolve(Modules.ORDER).createOrders([
          {
            currency_code: "usd",
            customer_id: owner.customer.id,
            email: "owner@example.com",
            items: [{ title: "Medusa Shorts", quantity: 1, unit_price: 15 }],
            shipping_address: {
              first_name: "Test",
              address_1: "Sihanouk Blvd",
              city: "Phnom Penh",
              country_code: "kh",
              phone: "012 345 678",
            },
          },
        ])
        return { order, pk, owner, other }
      }

      const get = (id: string, headers: Record<string, string>) =>
        api.get(`/store/orders/${id}`, { headers }).catch((e) => e.response)

      const proof = (orderId: string, exp = Math.floor(Date.now() / 1000) + 3600, secret = SECRET) =>
        `${exp}.${signOrderAccess(secret, orderId, exp)}`

      it("answers the owner", async () => {
        const { order, owner } = await setup()
        const res = await get(order.id, owner.headers)
        expect(res.status).toEqual(200)
        expect(res.data.order.id).toEqual(order.id)
      })

      it("answers 404 to another signed-in customer", async () => {
        const { order, other } = await setup()
        expect((await get(order.id, other.headers)).status).toEqual(404)
      })

      it("answers 404 to a guest without proof, or with a bad, expired or other order's proof", async () => {
        const { order, pk } = await setup()
        expect((await get(order.id, pk)).status).toEqual(404)
        const now = Math.floor(Date.now() / 1000)
        for (const bad of [
          proof(order.id, now + 3600, "wrong_secret"),
          proof(order.id, now - 1),
          proof("order_other"),
          "garbage",
        ]) {
          expect((await get(order.id, { ...pk, [ORDER_ACCESS_HEADER]: bad })).status).toEqual(404)
        }
        expect(
          (await api.get(`/store/orders/${order.id}/telegram-link`, { headers: pk }).catch((e) => e.response))
            .status
        ).toEqual(404)
      })

      it("answers a guest with a valid proof", async () => {
        const { order, pk } = await setup()
        const res = await get(order.id, { ...pk, [ORDER_ACCESS_HEADER]: proof(order.id) })
        expect(res.status).toEqual(200)
        expect(res.data.order.shipping_address.phone).toEqual("012 345 678")
      })
    })
  },
})
