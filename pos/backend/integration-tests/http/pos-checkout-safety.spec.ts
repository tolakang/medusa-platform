import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { POS_MODULE } from "../../src/modules/pos"
import type PosModuleService from "../../src/modules/pos/service"
import { posCheckoutWorkflow } from "../../src/workflows/pos-checkout"
import { openPosShiftWorkflow } from "../../src/workflows/pos-shift"
import { levelAt, stockAt } from "../helpers/pos-stock"

// Checkout safety (owner, 2026-11-25): the till's price preview is the total
// the sale charges, a retried sale is recorded once and can be looked up by
// its client_ref, and two registers of one shop can't sell the last unit twice.
jest.setTimeout(300 * 1000)

const SECRET = "supersecret"
const PASSWORD = "cashier-pass-123"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("POS checkout safety", () => {
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })
      const fail = (p: Promise<unknown>): Promise<{ status: number; data?: { message?: string } }> =>
        p.then(() => ({ status: 200 })).catch((e) => e.response)

      const setup = async () => {
        const container = getContainer()
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        await seed({ container })

        const user = await container.resolve(Modules.USER).createUsers({ email: "admin@example.com" })
        const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: user.email }],
          app_metadata: { user_id: user.id },
        })
        const admin = bearer(
          jwt.sign({ actor_id: user.id, actor_type: "user", auth_identity_id: identity.id }, SECRET, { expiresIn: "1d" })
        )
        const { data: invited } = await api.post("/admin/pos/cashiers", { name: "Sokha", email: "sokha@example.com" }, admin)
        const { data: reg } = await api.post("/auth/cashier/emailpass/register", { email: "sokha@example.com", password: PASSWORD })
        await api.post("/pos/cashiers/accept", { invite_code: invited.invite_code }, bearer(reg.token))
        const { data: login } = await api.post("/auth/cashier/emailpass", { email: "sokha@example.com", password: PASSWORD })
        const cashier = bearer(login.token)

        const [store] = await container.resolve(Modules.STORE).listStores({})
        const [location] = await container.resolve(Modules.STOCK_LOCATION).listStockLocations({ name: "Phnom Penh" })
        const { data: created } = await api.post(
          "/admin/pos/registers",
          { name: "Front till", code: "PP-1", stock_location_id: location.id, sales_channel_id: store.default_sales_channel_id },
          admin
        )
        const { data: opened } = await api.post("/pos/shifts/open", { register_id: created.register.id, opening_cash: 0 }, cashier)
        const {
          data: [variant],
        } = await container
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({ entity: "product_variant", fields: ["id"], filters: { sku: "SHIRT-L-BLACK" } })
        await stockAt(container, variant.id, location.id, 20)
        return { container, cashier, store, location, shift: opened.shift, variant }
      }

      it("previews the real total (promotion and tax) and records nothing; checkout charges that total", async () => {
        const { container, cashier, shift, variant } = await setup()
        await container.resolve(Modules.PROMOTION).createPromotions({
          code: "POS10",
          type: "standard",
          status: "active",
          application_method: { type: "percentage", target_type: "order", allocation: "across", value: 10, currency_code: "usd" },
        })
        const orders = container.resolve(Modules.ORDER)
        const [, before] = await orders.listAndCountOrders({}, { withDeleted: false })
        const items = [{ variant_id: variant.id, quantity: 2 }]

        const { data: full } = await api.post("/pos/checkout/preview", { shift_id: shift.id, items }, cashier)
        const { data: promo } = await api.post(
          "/pos/checkout/preview",
          { shift_id: shift.id, items, promo_codes: ["POS10"] },
          cashier
        )
        expect(full.preview).toEqual(
          expect.objectContaining({ currency_code: "usd", discount_total: 0, total: expect.any(Number) })
        )
        expect(full.preview.total).toBeGreaterThan(0)
        expect(promo.preview.discount_total).toBeGreaterThan(0)
        expect(promo.preview.total).toBeCloseTo(full.preview.total * 0.9, 2)
        expect(typeof promo.preview.tax_total).toEqual("number")

        // Nothing recorded or reserved by a preview.
        const [, after] = await orders.listAndCountOrders({})
        expect(after).toEqual(before)

        // Errors come back before payment opens.
        const badPromo = await fail(
          api.post("/pos/checkout/preview", { shift_id: shift.id, items, promo_codes: ["NOPE"] }, cashier)
        )
        expect(badPromo.status).toEqual(400)
        expect(badPromo.data?.message).toContain("NOPE is invalid")
        const tooMany = await fail(
          api.post("/pos/checkout/preview", { shift_id: shift.id, items: [{ variant_id: variant.id, quantity: 21 }] }, cashier)
        )
        expect(tooMany.data?.message).toContain("Not enough stock")

        const { data: sale } = await api.post(
          "/pos/checkout",
          { shift_id: shift.id, items, payment_method: "cash", promo_codes: ["POS10"] },
          cashier
        )
        expect(Number(sale.order.total)).toBeCloseTo(promo.preview.total, 2)
      })

      it("records a retried sale once, and the till can look a sale up by its client_ref", async () => {
        const { cashier, shift, variant } = await setup()
        const ref = "0d1f6a7e-5c4b-4a39-8b2c-1e0f9d8c7b6a"
        const lookup = () => api.get(`/pos/checkout?shift_id=${shift.id}&client_ref=${ref}`, cashier)

        expect((await fail(lookup())).status).toEqual(404)
        expect((await fail(api.get(`/pos/checkout?shift_id=${shift.id}&client_ref=nope`, cashier))).status).toEqual(400)

        const body = { shift_id: shift.id, items: [{ variant_id: variant.id, quantity: 1 }], payment_method: "card", client_ref: ref }
        const first = await api.post("/pos/checkout", body, cashier)
        expect(first.status).toEqual(201)
        const again = await api.post("/pos/checkout", body, cashier)
        expect(again.status).toEqual(200)
        expect(again.data.order.id).toEqual(first.data.order.id)

        const found = await lookup()
        expect(found.status).toEqual(200)
        expect(found.data.order).toEqual(expect.objectContaining({ id: first.data.order.id, total: first.data.order.total }))
      })

      it("two registers of one shop can't both sell its last unit", async () => {
        const { container, store, location, variant } = await setup()
        const pos = container.resolve<PosModuleService>(POS_MODULE)
        await stockAt(container, variant.id, location.id, 1)
        const shifts: string[] = []
        for (const code of ["PP-2", "PP-3"]) {
          const register = await pos.createPosRegisters({ name: code, code })
          await container.resolve(ContainerRegistrationKeys.LINK).create([
            {
              [POS_MODULE]: { pos_register_id: register.id },
              [Modules.SALES_CHANNEL]: { sales_channel_id: store.default_sales_channel_id },
            },
            { [POS_MODULE]: { pos_register_id: register.id }, [Modules.STOCK_LOCATION]: { stock_location_id: location.id } },
          ])
          const { result } = await openPosShiftWorkflow(container).run({
            input: { register_id: register.id, cashier_id: `pcash_${code}`, opening_cash: 0 },
          })
          shifts.push(result.id)
        }
        const results = await Promise.allSettled(
          shifts.map((shift_id) =>
            posCheckoutWorkflow(container).run({
              input: {
                shift_id,
                cashier_id: "pcash_x",
                items: [{ variant_id: variant.id, quantity: 1 }],
                payment_method: "cash",
              },
            })
          )
        )
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
        const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult
        expect((refused.reason as Error).message).toMatch(/Not enough stock|inventory/)
        const level = await levelAt(container, variant.id, location.id)
        expect(level.stocked).toEqual(0)
      })
    })
  },
})
