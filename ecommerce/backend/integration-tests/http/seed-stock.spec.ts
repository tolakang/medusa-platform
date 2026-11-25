import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seed from "../../src/scripts/seed"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seedDemoProducts from "../../src/scripts/seed-demo-products"

// Role tests 2026-11-25: demo products were all out of stock, the Cambodia
// location (POS registers) had no starter stock, the store kept Medusa's
// "Medusa Store" name and demo titles repeated. Setup as seed-initial-data.spec.
jest.setTimeout(240 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("seeds: stock, store name, demo titles", () => {
      it("stocks every product at every location", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()

        await seed({ container })
        await seedInitialData({ container })
        await seedDemoProducts({ container, args: [] } as never)

        const { data: stores } = await query.graph({
          entity: "store",
          fields: ["name"],
        })
        expect(stores[0].name).not.toEqual("Medusa Store")

        const { data: locations } = await query.graph({
          entity: "stock_location",
          fields: ["id"],
        })
        expect(locations.length).toBeGreaterThanOrEqual(2)

        const { data: items } = await query.graph({
          entity: "inventory_item",
          fields: ["id", "location_levels.location_id", "location_levels.stocked_quantity"],
        })
        expect(items.length).toBeGreaterThan(50)
        for (const item of items) {
          const stockedAt = (item.location_levels ?? [])
            .filter((l) => Number(l?.stocked_quantity) > 0)
            .map((l) => l?.location_id)
          for (const location of locations) {
            expect(stockedAt).toContain(location.id)
          }
        }

        const { data: demo } = await query.graph({
          entity: "product",
          fields: ["title", "handle", "description"],
        })
        const demoProducts = demo.filter((p) => p.handle?.startsWith("demo-"))
        expect(demoProducts).toHaveLength(50)
        expect(new Set(demoProducts.map((p) => p.title)).size).toEqual(50)
        expect(demoProducts.some((p) => /not a real product/i.test(p.description ?? ""))).toBe(false)
      })
    })
  },
})
