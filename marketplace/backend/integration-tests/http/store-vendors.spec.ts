import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { IP_SECRET, marketplaceTestKit } from "../helpers/marketplace"

jest.setTimeout(240 * 1000)

// TASKS P6-08 (plan §9.6): the storefront's vendor reads: a shop page per
// active vendor and "Sold by" per product.
medusaIntegrationTestRunner({
  env: { SHOPPER_IP_SECRET: IP_SECRET },
  testSuite: ({ api, getContainer }) => {
    describe("store vendor routes (TASKS P6-08)", () => {
      const kit = marketplaceTestKit(api, getContainer)
      let shop: Awaited<ReturnType<typeof kit.setupShop>>
      let admin: { headers: Record<string, string> }

      beforeEach(async () => {
        shop = await kit.setupShop()
        admin = await kit.adminAuth()
      })

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )

      it("shows an active vendor's shop with its published products only", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        await kit.giveProducts(dara.id, ["t-shirt", "sweatshirt"])
        const {
          data: [sweatshirt],
        } = await kit.query().graph({ entity: "product", fields: ["id"], filters: { handle: "sweatshirt" } })
        await api.post(`/admin/products/${sweatshirt.id}`, { status: "draft" }, admin)

        const res = await call(api.get("/store/vendors/dara-crafts", shop.store))
        expect(res.status).toBe(200)
        expect(res.data.vendor).toEqual(
          expect.objectContaining({ handle: "dara-crafts", name: "Dara Crafts" })
        )
        expect(res.data.vendor.status).toBeUndefined()
        const {
          data: [tshirt],
        } = await kit.query().graph({ entity: "product", fields: ["id"], filters: { handle: "t-shirt" } })
        expect(res.data.product_ids).toEqual([tshirt.id])

        // Suspended or unknown vendors have no shop; the publishable key is needed.
        await api.post(`/admin/vendors/${dara.id}`, { status: "suspended" }, admin)
        expect((await call(api.get("/store/vendors/dara-crafts", shop.store))).status).toBe(404)
        expect((await call(api.get("/store/vendors/nobody", shop.store))).status).toBe(404)
        expect((await call(api.get("/store/vendors/dara-crafts"))).status).toBe(400)
      })

      it("lists active shops in a directory (bug 2026-11-25)", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        const sok = await kit.signUpVendor(admin, "sok@vendor.test", "Sok Goods")
        const res = await call(api.get("/store/vendors", shop.store))
        expect(res.status).toBe(200)
        expect(res.data.vendors.map((v: { handle: string }) => v.handle)).toEqual(["dara-crafts", "sok-goods"])
        expect(res.data.vendors[0].email).toBeUndefined()
        await api.post(`/admin/vendors/${sok.id}`, { status: "suspended" }, admin)
        const after = await call(api.get("/store/vendors", shop.store))
        expect(after.data.vendors.map((v: { id: string }) => v.id)).toEqual([dara.id])
      })

      it("a suspended vendor's products leave the store and can't be bought (bug 2026-11-25)", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        await kit.giveProducts(dara.id, ["t-shirt"])
        const cartId = await kit.readyCart(shop, [{ handle: "t-shirt", quantity: 1 }])
        const listed = async () =>
          (await call(api.get("/store/products?handle=t-shirt", shop.store))).data.products.length
        expect(await listed()).toBe(1)

        await api.post(`/admin/vendors/${dara.id}`, { status: "suspended" }, admin)
        expect(await listed()).toBe(0)
        const {
          data: [tshirt],
        } = await kit.query().graph({ entity: "product", fields: ["variants.id"], filters: { handle: "t-shirt" } })
        const add = await call(
          api.post(`/store/carts/${cartId}/line-items`, { variant_id: tshirt.variants[0].id, quantity: 1 }, shop.store)
        )
        expect(add.status).toBe(400)
        const done = await call(api.post(`/store/carts/${cartId}/complete-vendor`, {}, shop.store))
        expect(done.status).toBe(400)
        expect(done.data.message).toMatch(/no longer selling/)

        // Re-activated: back on sale.
        await api.post(`/admin/vendors/${dara.id}`, { status: "active" }, admin)
        expect(await listed()).toBe(1)
      })

      it("names the vendor of each product", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        await kit.giveProducts(dara.id, ["t-shirt"])
        const { data: products } = await kit.query().graph({
          entity: "product",
          fields: ["id", "handle"],
          filters: { handle: ["t-shirt", "shorts"] },
        })
        const id = (h: string) => products.find((p) => p.handle === h)!.id
        const res = await call(
          api.get(`/store/product-vendors?product_id=${id("t-shirt")}&product_id=${id("shorts")}`, shop.store)
        )
        expect(res.status).toBe(200)
        expect(res.data.product_vendors).toEqual([
          { product_id: id("t-shirt"), vendor: { handle: "dara-crafts", name: "Dara Crafts" } },
        ])
        const one = await call(api.get(`/store/product-vendors?product_id=${id("t-shirt")}`, shop.store))
        expect(one.data.product_vendors).toHaveLength(1)
        expect((await call(api.get("/store/product-vendors", shop.store))).status).toBe(400)
      })
    })
  },
})
