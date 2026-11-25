import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"
import { IP_SECRET, marketplaceTestKit } from "../helpers/marketplace"

jest.setTimeout(240 * 1000)

const SECRET = "supersecret"

// GET /store/customers/me/orders/:id/shipments: the shopper sees each
// vendor's tracking for their own order, and nothing for anyone else's.
medusaIntegrationTestRunner({
  env: { SHOPPER_IP_SECRET: IP_SECRET },
  testSuite: ({ api, getContainer }) => {
    describe("customer order shipments", () => {
      const kit = marketplaceTestKit(api, getContainer)

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )

      const signIn = async (store: Record<string, string>, email: string) => {
        const container = getContainer()
        const customer = await container.resolve(Modules.CUSTOMER).createCustomers({ email })
        const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { customer_id: customer.id },
        })
        const token = jwt.sign(
          { actor_id: customer.id, actor_type: "customer", auth_identity_id: identity.id },
          SECRET,
          { expiresIn: "1d" }
        )
        return { headers: { ...store, authorization: `Bearer ${token}` } }
      }

      it("returns each vendor's tracking only to the order's owner", async () => {
        const shop = await kit.setupShop()
        const admin = await kit.adminAuth()
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        const sok = await kit.signUpVendor(admin, "sok@vendor.test", "Sok Goods")
        await kit.giveProducts(dara.id, ["t-shirt"])
        await kit.giveProducts(sok.id, ["sweatshirt"])

        const buyer = await signIn(shop.store.headers, "buyer@test.test")
        const other = await signIn(shop.store.headers, "other@test.test")
        const cartId = await kit.readyCart({ store: buyer, regionId: shop.regionId }, [
          { handle: "t-shirt", quantity: 1 },
          { handle: "sweatshirt", quantity: 1 },
        ])
        const placed = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, buyer)
        const parentId = placed.data.order.id
        const daraChild = (placed.data.vendor_orders as { vendor_id: string; order_id: string }[]).find(
          (c) => c.vendor_id === dara.id
        )!.order_id

        // Nothing shipped yet: one entry per vendor, no fulfilments.
        const before = await call(api.get(`/store/customers/me/orders/${parentId}/shipments`, buyer))
        expect(before.status).toBe(200)
        expect(before.data.shipments).toHaveLength(2)
        expect(before.data.shipments.every((s: any) => s.fulfillments.length === 0)).toBe(true)

        await api.post(
          `/vendors/me/orders/${daraChild}/fulfillments`,
          { tracking_number: "KH123", tracking_url: "https://track.example/KH123" },
          dara.auth
        )

        const after = await call(api.get(`/store/customers/me/orders/${parentId}/shipments`, buyer))
        expect(after.status).toBe(200)
        const daraShipments = after.data.shipments.find((s: any) => s.vendor?.name === "Dara Crafts")
        expect(daraShipments.fulfillments).toHaveLength(1)
        expect(daraShipments.fulfillments[0].labels).toEqual([
          { tracking_number: "KH123", tracking_url: "https://track.example/KH123" },
        ])
        const sokShipments = after.data.shipments.find((s: any) => s.vendor?.name === "Sok Goods")
        expect(sokShipments.fulfillments).toEqual([])

        // Another customer, a child order id, a guest: no data.
        expect((await call(api.get(`/store/customers/me/orders/${parentId}/shipments`, other))).status).toBe(404)
        expect((await call(api.get(`/store/customers/me/orders/${daraChild}/shipments`, buyer))).status).toBe(404)
        expect(
          (await call(api.get(`/store/customers/me/orders/${parentId}/shipments`, shop.store))).status
        ).toBe(401)
      })
    })
  },
})
