import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  capturePaymentWorkflow,
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
  refundPaymentWorkflow,
} from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import { cancelBookingWorkflow } from "../../src/workflows/cancel-booking"
import {
  createProviderPayoutsWorkflow,
  NOT_TO_REVIEW_MESSAGE,
  PAYOUT_NOT_PENDING_MESSAGE,
  providerCommissionOnCancelWorkflow,
} from "../../src/workflows/provider-commission"

jest.setTimeout(300 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()

// TASKS P3-33 (plan §9.3 "Money"): the shop's commission on each partner
// booking at the partner's rate (the default otherwise), none on staff
// bookings; a cancel with a refund cancels it, one without keeps it; another
// refund on the order holds it for the admin; monthly payouts per partner,
// marked paid with a reference; the partner sees their earnings, staff
// don't.
medusaIntegrationTestRunner({
  env: { SHOPPER_IP_SECRET: "test-ip-secret", BOOKING_DEFAULT_COMMISSION_RATE: "10" },
  testSuite: ({ api, getContainer }) => {
    describe("partner money (TASKS P3-33)", () => {
      let admin: { headers: Record<string, string> }
      let store: { headers: Record<string, string> }
      let regionId: string

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )
      let ip = 0
      const bearer = (token?: string): { headers: Record<string, string> } => ({
        headers: {
          "x-shopper-ip-secret": "test-ip-secret",
          "x-shopper-ip": `10.3.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      })
      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const wait = async <T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> => {
        let value = await read()
        for (let i = 0; i < 60 && !ok(value); i++) {
          await new Promise((r) => setTimeout(r, 250))
          value = await read()
        }
        return value
      }

      const confirmEmail = async (email: string) => {
        const auth = getContainer().resolve(Modules.AUTH)
        const [identity] = await auth.listProviderIdentities({ entity_id: email, provider: "emailpass" })
        const { code } = await auth.requestAuthVerification({
          entity_id: email,
          entity_type: "email",
          auth_identity_id: identity.auth_identity_id!,
          code_provider: "token",
        })
        await auth.confirmAuthVerification({ code: code! })
      }
      const signIn = async (email: string) => {
        const res = await call(api.post("/auth/provider/emailpass", { email, password: "provider-pass-1" }, bearer()))
        expect([email, res.status]).toEqual([email, 200])
        return bearer(res.data.token)
      }
      // An approved partner with Monday hours and one 60-minute service.
      const partner = async (email: string, name: string, rate: number | null) => {
        const reg = await call(api.post("/auth/provider/emailpass/register", { email, password: "provider-pass-1" }, bearer()))
        const created = await call(api.post("/providers", { name }, bearer(reg.data.token)))
        await confirmEmail(email)
        await call(api.post(`/admin/booking/providers/${created.data.provider.id}`, { status: "active", commission_rate: rate }, admin))
        const auth = await signIn(email)
        const calendar = created.data.provider.resources[0]
        await call(api.post(`/providers/me/resources/${calendar.id}`, { schedules: [{ weekday: 1, start_time: "09:00", end_time: "17:00" }] }, auth))
        const service = (await call(api.post("/providers/me/services", { title: `${name} visit`, lengths: [{ minutes: 60, price: 18 }] }, auth))).data.service
        return { id: created.data.provider.id as string, auth, calendar, variantId: service.variants[0].id as string }
      }

      // A paid (captured) order with one booking per given variant, each at
      // its own Monday hour.
      const order = async (lines: { variantId: string; hour: number }[]) => {
        const cart = (await api.post("/store/carts", { region_id: regionId, email: "sok@example.com" }, store)).data.cart
        const bookingIds: string[] = []
        for (const l of lines) {
          const { data } = await api.get(`/store/booking/slots?variant_id=${l.variantId}&date=${monday}`, store)
          const slot = data.slots.find((s: any) => new Date(s.starts_at).getUTCHours() === l.hour)
          const added = await api.post(
            "/store/booking/cart",
            { cart_id: cart.id, variant_id: l.variantId, resource_id: slot.resource_id, starts_at: slot.starts_at, ends_at: slot.ends_at },
            store
          )
          bookingIds.push(added.data.booking.id)
        }
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart.id }, store)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, store)
        const { data } = await api.post(`/store/carts/${cart.id}/complete`, {}, store)
        const orderId = data.order.id as string
        await wait(
          () => booking().listBookingCommissions({ order_id: orderId }),
          () => true
        )
        // Confirmed and linked (cancel-booking finds the order by the link).
        for (const id of bookingIds) {
          await wait(
            async () => (await query().graph({ entity: "booking", fields: ["status", "order.id"], filters: { id } })).data[0],
            (b) => b?.status === "confirmed" && !!b.order?.id
          )
        }
        const {
          data: [o],
        } = await query().graph({ entity: "order", fields: ["id", "payment_collections.payments.id"], filters: { id: orderId } })
        const paymentId = o.payment_collections![0]!.payments![0]!.id
        await capturePaymentWorkflow(getContainer()).run({ input: { payment_id: paymentId } })
        return { orderId, bookingIds, paymentId }
      }
      const commissionsOf = (orderId: string, count: number) =>
        wait(
          () => booking().listBookingCommissions({ order_id: orderId }),
          (c) => c.length >= count
        )

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
        const signedIn = await call(api.post("/auth/user/emailpass", { email, password: "supersecret1" }))
        expect(signedIn.status).toBe(200)
        admin = bearer(signedIn.data.token)
      })

      it("records the shop's commission on partner bookings only, at the partner's rate or the default", async () => {
        const dara = await partner("dara@clinic.test", "Dara", 12.5)
        const vuthy = await partner("vuthy@clinic.test", "Vuthy", null)
        const {
          data: [haircut],
        } = await query().graph({ entity: "product", fields: ["variants.id", "variants.title"], filters: { handle: "haircut" } })
        const staffVariant = haircut.variants!.find((v) => v!.title === "60 min")!.id
        const { orderId } = await order([
          { variantId: dara.variantId, hour: 2 },
          { variantId: vuthy.variantId, hour: 3 },
          { variantId: staffVariant, hour: 4 },
        ])
        const commissions = await commissionsOf(orderId, 2)
        expect(
          commissions
            .map((c) => [c.provider_id, Number(c.line_total), Number(c.base), c.rate, Number(c.amount), Number(c.payout_amount), c.currency_code, c.status])
            .sort()
        ).toEqual(
          [
            [dara.id, 18, 18, 12.5, 2.25, 15.75, "usd", "pending"],
            [vuthy.id, 18, 18, 10, 1.8, 16.2, "usd", "pending"],
          ].sort()
        )
        // Sophea's (staff) booking earns no commission; a second order.placed changes nothing.
        expect(commissions).toHaveLength(2)

        // The partner's earnings: their own only; staff never see money.
        const earnings = await call(api.get("/providers/me/earnings", dara.auth))
        expect(earnings.status).toBe(200)
        expect(earnings.data.commissions.map((c: any) => [Number(c.amount), Number(c.payout_amount), c.status])).toEqual([[2.25, 15.75, "pending"]])
        expect(earnings.data.commissions[0].booking).toEqual(expect.objectContaining({ timezone: "Asia/Phnom_Penh", order_display_id: expect.any(Number) }))
        expect(earnings.data.not_yet_paid_out).toEqual([{ currency_code: "usd", amount: 15.75 }])
        const [sophea] = await booking().listBookingResources({ name: "Sophea" })
        const invited = await call(api.post("/admin/booking/providers", { name: "Sophea", email: "sophea@spa.test", resource_id: sophea.id }, admin))
        const reg = await call(api.post("/auth/provider/emailpass/register", { email: "sophea@spa.test", password: "provider-pass-1" }, bearer()))
        await call(api.post("/providers/accept", { invite_code: invited.data.provider.invite_code }, bearer(reg.data.token)))
        await confirmEmail("sophea@spa.test")
        expect((await call(api.get("/providers/me/earnings", await signIn("sophea@spa.test")))).status).toBe(400)
      })

      it("a refunded cancel cancels the commission; a cancel without refund keeps it", async () => {
        const dara = await partner("dara@clinic.test", "Dara", 10)
        const { orderId, bookingIds } = await order([
          { variantId: dara.variantId, hour: 2 },
          { variantId: dara.variantId, hour: 3 },
        ])
        await commissionsOf(orderId, 2)
        // Inside the policy: refunded, so nothing is owed for it.
        const refunded = await cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingIds[0] } })
        expect(refunded.result.refund).toBe("refunded")
        // Outside the policy there is no refund (the booking is days away,
        // so its cancel would refund): what cancel-booking then does.
        const kept = await providerCommissionOnCancelWorkflow(getContainer()).run({
          input: { booking_id: bookingIds[1], refunded_amount: 0 },
        })
        expect(kept.result).toBe("kept")
        const byId = async () => new Map((await booking().listBookingCommissions({ order_id: orderId })).map((c) => [c.booking_id, c]))
        const after = await byId()
        expect([after.get(bookingIds[0])!.status, Number(after.get(bookingIds[0])!.refunded_amount)]).toEqual(["cancelled", 18])
        expect(after.get(bookingIds[1])!.status).toBe("pending")
        // That refund is explained by the cancel: the other booking isn't held.
        expect(after.get(bookingIds[1])!.refund_review).toBe("none")
      })

      it("a refund the cancels don't explain holds the order's commissions until the admin settles them", async () => {
        const dara = await partner("dara@clinic.test", "Dara", 10)
        const { orderId, paymentId } = await order([{ variantId: dara.variantId, hour: 2 }])
        const [c] = await commissionsOf(orderId, 1)
        await refundPaymentWorkflow(getContainer()).run({ input: { payment_id: paymentId, amount: 5, note: "Goodwill" } })
        const held = await wait(
          async () => (await booking().listBookingCommissions({ id: c.id }))[0],
          (x) => x.refund_review === "to_review"
        )
        expect(held.refund_review).toBe("to_review")
        const list = await api.get("/admin/booking/commissions?refund_review=to_review", admin)
        expect(list.data.commissions.map((x: any) => [x.id, x.provider.name])).toEqual([[c.id, "Dara"]])

        // Held out of a payout run.
        const cutoff = new Date(Date.now() + 60_000)
        const none = await createProviderPayoutsWorkflow(getContainer()).run({ input: { cutoff, period: "2030-01" } })
        expect(none.result).toEqual([])

        // Kept by the admin: the next run pays it. Settling twice is refused.
        expect((await call(api.post(`/admin/booking/commissions/${c.id}/settle`, { action: "keep" }, admin))).status).toBe(200)
        const twice = await call(api.post(`/admin/booking/commissions/${c.id}/settle`, { action: "keep" }, admin))
        expect(twice.data.message).toBe(NOT_TO_REVIEW_MESSAGE)
        const paid = await createProviderPayoutsWorkflow(getContainer()).run({ input: { cutoff, period: "2030-02" } })
        expect(paid.result.map((p) => [p.provider_id, p.amount, p.count])).toEqual([[dara.id, 16.2, 1]])
      })

      it("makes one payout per partner and month, marked paid with a reference", async () => {
        const dara = await partner("dara@clinic.test", "Dara", 10)
        const { orderId } = await order([
          { variantId: dara.variantId, hour: 2 },
          { variantId: dara.variantId, hour: 3 },
        ])
        await commissionsOf(orderId, 2)
        const cutoff = new Date(Date.now() + 60_000)
        // Not due yet before the cutoff.
        expect((await createProviderPayoutsWorkflow(getContainer()).run({ input: { cutoff: new Date(0), period: "2029-12" } })).result).toEqual([])

        const run = await call(api.post("/admin/booking/payouts/run", {}, admin))
        expect(run.status).toBe(200)
        const first = await createProviderPayoutsWorkflow(getContainer()).run({ input: { cutoff, period: "2030-03" } })
        expect(first.result.map((p) => [p.provider_id, p.amount, p.currency_code, p.count])).toEqual([[dara.id, 32.4, "usd", 2]])
        // Running again for the month makes nothing new.
        expect((await createProviderPayoutsWorkflow(getContainer()).run({ input: { cutoff, period: "2030-03" } })).result).toEqual([])

        const { data } = await api.get("/admin/booking/payouts", admin)
        const payout = data.payouts.find((p: any) => p.period === "2030-03")
        expect([Number(payout.amount), payout.status, payout.provider.name]).toEqual([32.4, "pending", "Dara"])
        expect((await call(api.post(`/admin/booking/payouts/${payout.id}/pay`, {}, admin))).status).toBe(400)
        const done = await call(api.post(`/admin/booking/payouts/${payout.id}/pay`, { reference: "ABA 123" }, admin))
        expect(done.status).toBe(200)
        const again = await call(api.post(`/admin/booking/payouts/${payout.id}/pay`, { reference: "ABA 123" }, admin))
        expect(again.data.message).toBe(PAYOUT_NOT_PENDING_MESSAGE)
        // A paid payout can't be cancelled; an unknown one is 404 (gap review 2026-11-24).
        expect((await call(api.post(`/admin/booking/payouts/${payout.id}/cancel`, {}, admin))).status).toBe(400)
        expect((await call(api.post(`/admin/booking/payouts/bpay_missing/cancel`, {}, admin))).status).toBe(404)

        const earnings = await api.get("/providers/me/earnings", dara.auth)
        expect(earnings.data.commissions.map((c: any) => c.status)).toEqual(["paid", "paid"])
        expect(earnings.data.payouts.map((p: any) => [p.period, Number(p.amount), p.status, p.reference])).toEqual([["2030-03", 32.4, "paid", "ABA 123"]])
        expect(earnings.data.not_yet_paid_out).toEqual([])

        // A refund after the payout flags the commission for the admin.
        const bookingId = (await booking().listBookingCommissions({ order_id: orderId }))[0].booking_id
        await cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId } })
        const [flagged] = await booking().listBookingCommissions({ booking_id: bookingId })
        expect([flagged.status, flagged.refund_review]).toEqual(["paid", "to_review"])
      })
    })
  },
})
