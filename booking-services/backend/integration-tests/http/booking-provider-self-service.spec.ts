import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import { PASSWORD_RESET_TEMPLATE } from "@medusa-platform/medusa-core/lib/auth-email"
import { PARTNERS_ONLY_MESSAGE } from "../../src/api/providers/me/own"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import { DAY_OFF_EXISTS_MESSAGE } from "../../src/workflows/provider-calendar"

jest.setTimeout(240 * 1000)

const PORTAL = "https://providers.booking.test"

// The next Monday at least 7 days ahead, and its 09:00 in Phnom Penh (UTC+7).
const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()
const at = (hhmmUtc: string) => `${monday}T${hhmmUtc}:00.000Z`
const WEEK = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: "09:00", end_time: "12:00" }))

// TASKS P3-32 (plan §9.3 "Providers"): what a provider does for themself.
// Staff see and serve their own calendar; partners also set their hours and
// days off and add their own services; nobody reaches another provider's
// calendars, bookings or services.
medusaIntegrationTestRunner({
  env: { PROVIDER_CORS: PORTAL, SHOPPER_IP_SECRET: "test-ip-secret" },
  testSuite: ({ api, getContainer }) => {
    describe("provider self-service (TASKS P3-32)", () => {
      let admin: { headers: Record<string, string> }
      let store: { headers: Record<string, string> }

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )
      let ip = 0
      const freshIp = () => ({
        "x-shopper-ip-secret": "test-ip-secret",
        "x-shopper-ip": `10.2.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`,
      })
      const bearer = (token?: string): { headers: Record<string, string> } => ({
        headers: { ...freshIp(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      })
      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)

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
      const register = async (email: string) => {
        const res = await call(api.post("/auth/provider/emailpass/register", { email, password: "provider-pass-1" }, { headers: freshIp() }))
        expect([email, res.status, res.data?.message]).toEqual([email, 200, undefined])
        return res.data.token as string
      }
      const login = async (email: string) => {
        const res = await call(api.post("/auth/provider/emailpass", { email, password: "provider-pass-1" }, { headers: freshIp() }))
        expect([email, res.status, res.data?.message]).toEqual([email, 200, undefined])
        return bearer(res.data.token as string)
      }
      // An approved partner, signed in.
      const partner = async (email: string, name: string) => {
        const created = await api.post("/providers", { name }, bearer(await register(email)))
        await confirmEmail(email)
        await api.post(`/admin/booking/providers/${created.data.provider.id}`, { status: "active" }, admin)
        const auth = await login(email)
        const { data } = await api.get("/providers/me", auth)
        return { auth, provider: data.provider, calendar: data.provider.resources[0] as { id: string; name: string } }
      }
      // An accepted staff member for an existing calendar, signed in.
      const staff = async (email: string, name: string, resource_id: string) => {
        const invited = await call(api.post("/admin/booking/providers", { name, email, resource_id }, admin))
        expect([invited.status, invited.data?.message]).toEqual([201, undefined])
        const accepted = await call(
          api.post("/providers/accept", { invite_code: invited.data.provider.invite_code }, bearer(await register(email)))
        )
        expect([accepted.status, accepted.data?.message]).toEqual([200, undefined])
        await confirmEmail(email)
        return login(email)
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
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const {
          data: [key],
        } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        store = { headers: { "x-publishable-api-key": key.token } }

        const email = "admin@booking.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        const signedIn = await call(api.post("/auth/user/emailpass", { email, password: "supersecret1" }))
        expect([signedIn.status, signedIn.data?.message]).toEqual([200, undefined])
        admin = bearer(signedIn.data.token)
      })

      it("a partner gets a calendar, sets hours and days off, and adds a service customers can book", async () => {
        const dara = await partner("dara@clinic.test", "Dr. Dara")
        expect(dara.calendar).toEqual(expect.objectContaining({ name: "Dr. Dara", type: "staff", timezone: "Asia/Phnom_Penh" }))

        // Hours: replaced as a whole.
        const hours = await call(api.post(`/providers/me/resources/${dara.calendar.id}`, { schedules: WEEK }, dara.auth))
        expect(hours.status).toBe(200)
        expect(hours.data.resource.schedules).toHaveLength(5)
        expect((await call(api.post(`/providers/me/resources/${dara.calendar.id}`, { schedules: [{ weekday: 1, start_time: "12:00", end_time: "09:00" }] }, dara.auth))).status).toBe(400)
        // Only hours: the name or capacity can't be changed here.
        expect((await call(api.post(`/providers/me/resources/${dara.calendar.id}`, { schedules: WEEK, capacity: 9 }, dara.auth))).status).toBe(400)

        // A service with two lengths, in the shop under Appointments.
        const created = await call(
          api.post(
            "/providers/me/services",
            { title: "Consultation", description: "See the doctor.", lengths: [{ minutes: 30, price: 10 }, { minutes: 60, price: 18 }] },
            dara.auth
          )
        )
        expect(created.status).toBe(201)
        const service = created.data.service
        expect(service).toEqual(expect.objectContaining({ title: "Consultation", status: "published" }))
        expect(service.variants.map((v: any) => [v.title, v.metadata.duration_minutes, v.prices[0].amount, v.prices[0].currency_code])).toEqual([
          ["30 min", 30, 10, "usd"],
          ["60 min", 60, 18, "usd"],
        ])
        const { data: categories } = await api.get("/store/product-categories?handle=appointments&fields=id", store)
        const listed = await api.get(`/store/products?category_id[]=${categories.product_categories[0].id}&fields=handle,title`, store)
        expect(listed.data.products.map((p: { title: string }) => p.title).sort()).toEqual(["Consultation", "Full house move", "Haircut"])

        // Its times are the partner's own hours: 09:00-12:00 = three hours.
        const hour = service.variants[1].id
        const slots = async (date = monday) =>
          (await api.get(`/store/booking/slots?variant_id=${hour}&date=${date}`, store)).data.slots as { resource_name: string }[]
        expect((await slots()).map((s) => s.resource_name)).toEqual(["Dr. Dara", "Dr. Dara", "Dr. Dara"])

        // A day off closes that day only; twice is refused; removing reopens.
        const off = await call(api.post(`/providers/me/resources/${dara.calendar.id}/days-off`, { date: monday }, dara.auth))
        expect(off.status).toBe(201)
        expect(off.data.resource.days_off).toEqual([{ date: monday }])
        expect(await slots()).toEqual([])
        const check = await booking().checkSlot({ resource_id: dara.calendar.id, starts_at: new Date(at("02:00")), ends_at: new Date(at("03:00")) })
        expect(check.available).toBe(false)
        const again = await call(api.post(`/providers/me/resources/${dara.calendar.id}/days-off`, { date: monday }, dara.auth))
        expect(again.data.message).toBe(DAY_OFF_EXISTS_MESSAGE)
        expect((await call(api.post(`/providers/me/resources/${dara.calendar.id}/days-off`, { date: "next monday" }, dara.auth))).status).toBe(400)
        const back = await call(api.delete(`/providers/me/resources/${dara.calendar.id}/days-off/${monday}`, dara.auth))
        expect(back.data.resource.days_off).toEqual([])
        expect(await slots()).toHaveLength(3)

        // New price, new name; hidden as a draft, the shop no longer lists it.
        const updated = await call(
          api.post(
            `/providers/me/services/${service.id}`,
            { title: "Doctor's consultation", prices: [{ variant_id: hour, price: 20 }] },
            dara.auth
          )
        )
        expect(updated.status).toBe(200)
        expect(updated.data.service.title).toBe("Doctor's consultation")
        expect(updated.data.service.variants.find((v: any) => v.id === hour).prices[0].amount).toBe(20)
        await api.post(`/providers/me/services/${service.id}`, { status: "draft" }, dara.auth)
        const hidden = await api.get(`/store/products?category_id[]=${categories.product_categories[0].id}&fields=title`, store)
        expect(hidden.data.products.map((p: { title: string }) => p.title).sort()).toEqual(["Full house move", "Haircut"])
      })

      it("a partner builds an event package from their own services, and the shop books it whole (P3-30)", async () => {
        const dara = await partner("dara@clinic.test", "Dr. Dara")
        const vuthy = await partner("vuthy@clinic.test", "Dr. Vuthy")
        await api.post(`/providers/me/resources/${dara.calendar.id}`, { schedules: WEEK }, dara.auth)
        const check = (await api.post("/providers/me/services", { title: "Check-up", lengths: [{ minutes: 60, price: 5 }] }, dara.auth)).data.service
        const other = (await api.post("/providers/me/services", { title: "X-ray", lengths: [{ minutes: 30, price: 9 }] }, vuthy.auth)).data.service

        // Someone else's service can't be a piece.
        const theirs = await call(
          api.post("/providers/me/packages", { title: "Mixed", price: 20, pieces: [{ variant_id: other.variants[0].id, time: "09:00" }] }, dara.auth)
        )
        expect(theirs.status).toBe(400)

        const made = await api.post(
          "/providers/me/packages",
          {
            title: "Family check-up morning",
            price: 12,
            pieces: [
              { variant_id: check.variants[0].id, time: "09:00", label: "First check-up" },
              { variant_id: check.variants[0].id, time: "10:00", label: "Second check-up" },
            ],
          },
          dara.auth
        )
        expect(made.status).toBe(201)
        expect(made.data.package).toMatchObject({ title: "Family check-up morning", price: { amount: 12 } })
        expect((await api.get("/providers/me/packages", dara.auth)).data.packages).toHaveLength(1)
        // Not listed as a service, and not Vuthy's.
        expect((await api.get("/providers/me/services", dara.auth)).data.services.map((x: any) => x.title)).toEqual(["Check-up"])
        expect((await api.get("/providers/me/packages", vuthy.auth)).data.packages).toEqual([])

        // Dara renames, reprices and hides it; Vuthy can't touch it (gap review 2026-11-24).
        const pkgId = made.data.package.id
        const edited = await call(api.post(`/providers/me/packages/${pkgId}`, { title: "Family morning", price: 15 }, dara.auth))
        expect(edited.data.package).toMatchObject({ title: "Family morning", price: { amount: 15 } })
        expect((await call(api.post(`/providers/me/packages/${pkgId}`, { status: "draft" }, dara.auth))).data.package.status).toBe("draft")
        expect((await call(api.post(`/providers/me/packages/${pkgId}`, { title: "Mine" }, vuthy.auth))).status).toBe(404)
        expect((await call(api.post(`/providers/me/packages/${pkgId}`, { price: -1 }, dara.auth))).status).toBe(400)
        await api.post(`/providers/me/packages/${pkgId}`, { title: "Family check-up morning", price: 12, status: "published" }, dara.auth)

        // A customer books it on a Monday: both times on Dara's calendar, at $12.
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const regionId = (await query.graph({ entity: "region", fields: ["id"] })).data[0].id
        const {
          data: [product],
        } = await query.graph({ entity: "product", fields: ["variants.id"], filters: { id: made.data.package.id } })
        const cart = (await api.post("/store/carts", { region_id: regionId }, store)).data.cart.id
        const booked = await call(api.post("/store/booking/package", { cart_id: cart, variant_id: product.variants![0]!.id, date: monday }, store))
        expect(booked.status).toBe(200)
        const items = (await api.get(`/store/carts/${cart}`, store)).data.cart.items
        expect(items.map((i: any) => i.unit_price).sort((a: number, b: number) => a - b)).toEqual([0, 0, 12])
      })

      it("a provider sees and serves only their own calendars, bookings and services", async () => {
        const dara = await partner("dara@clinic.test", "Dr. Dara")
        const vuthy = await partner("vuthy@clinic.test", "Dr. Vuthy")
        await api.post(`/providers/me/resources/${dara.calendar.id}`, { schedules: WEEK }, dara.auth)
        await api.post(`/providers/me/resources/${vuthy.calendar.id}`, { schedules: WEEK }, vuthy.auth)
        const service = (await api.post("/providers/me/services", { title: "Check-up", lengths: [{ minutes: 60, price: 5 }] }, dara.auth)).data.service

        // Dara books a walk-in on her own calendar; Vuthy can't on hers.
        const walkIn = { resource_id: dara.calendar.id, starts_at: at("02:00"), ends_at: at("03:00"), notes: "Walk-in" }
        const made = await call(api.post("/providers/me/bookings", walkIn, dara.auth))
        expect(made.status).toBe(201)
        expect((await call(api.post("/providers/me/bookings", walkIn, vuthy.auth))).status).toBe(404)
        // A customer id can't be attached by a provider.
        expect((await call(api.post("/providers/me/bookings", { ...walkIn, starts_at: at("03:00"), ends_at: at("04:00"), customer_id: "cus_1" }, dara.auth))).status).toBe(400)

        const window = `from=${at("00:00")}&to=${at("23:00")}`
        const mine = await api.get(`/providers/me/bookings?${window}`, dara.auth)
        expect(mine.data.bookings.map((b: any) => [b.id, b.status, b.resource.name, b.notes])).toEqual([
          [made.data.booking.id, "confirmed", "Dr. Dara", "Walk-in"],
        ])
        expect((await api.get(`/providers/me/bookings?${window}`, vuthy.auth)).data.bookings).toEqual([])
        expect((await call(api.get(`/providers/me/bookings?${window}&resource_id=${dara.calendar.id}`, vuthy.auth))).status).toBe(404)

        // Vuthy can't touch Dara's calendar, days off, service or booking.
        expect((await call(api.post(`/providers/me/resources/${dara.calendar.id}`, { schedules: [] }, vuthy.auth))).status).toBe(404)
        expect((await call(api.post(`/providers/me/resources/${dara.calendar.id}/days-off`, { date: monday }, vuthy.auth))).status).toBe(404)
        expect((await call(api.delete(`/providers/me/resources/${dara.calendar.id}/days-off/${monday}`, vuthy.auth))).status).toBe(404)
        expect((await call(api.post(`/providers/me/services/${service.id}`, { title: "Mine now" }, vuthy.auth))).status).toBe(404)
        expect((await call(api.post(`/providers/me/bookings/${made.data.booking.id}/cancel`, {}, vuthy.auth))).status).toBe(404)
        expect((await api.get("/providers/me/services", vuthy.auth)).data.services).toEqual([])
        expect((await api.get("/providers/me/resources", vuthy.auth)).data.resources.map((r: any) => r.id)).toEqual([vuthy.calendar.id])
        // Nor the shop's own service.
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data: [haircut] } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: "haircut" } })
        expect((await call(api.post(`/providers/me/services/${haircut.id}`, { status: "draft" }, dara.auth))).status).toBe(404)

        // Dara cancels her own booking; a partner sees the refund amount field.
        const cancelled = await call(api.post(`/providers/me/bookings/${made.data.booking.id}/cancel`, {}, dara.auth))
        expect(cancelled.status).toBe(200)
        expect(cancelled.data.booking.status).toBe("cancelled")
        expect(cancelled.data).toHaveProperty("refunded_amount")
      })

      it("staff see and serve their calendar but don't set hours, days off or services, or see money", async () => {
        const [sophea] = await booking().listBookingResources({ name: "Sophea" })
        const auth = await staff("sophea@spa.test", "Sophea", sophea.id)

        const resources = await call(api.get("/providers/me/resources", auth))
        expect([resources.status, resources.data?.message]).toEqual([200, undefined])
        expect(resources.data.resources.map((r: any) => r.id)).toEqual([sophea.id])
        expect(resources.data.resources[0].schedules.length).toBeGreaterThan(0)

        const made = await call(
          api.post("/providers/me/bookings", { resource_id: sophea.id, starts_at: at("02:00"), ends_at: at("02:30") }, auth)
        )
        expect(made.status).toBe(201)
        // The admin's calendar shows the same booking.
        const adminView = await call(api.get(`/admin/booking/bookings?from=${at("00:00")}&to=${at("23:00")}&resource_id=${sophea.id}`, admin))
        expect([adminView.status, adminView.data?.message]).toEqual([200, undefined])
        expect(adminView.data.bookings.map((b: any) => b.id)).toEqual([made.data.booking.id])
        const cancelled = await call(api.post(`/providers/me/bookings/${made.data.booking.id}/cancel`, {}, auth))
        expect(cancelled.status).toBe(200)
        expect(cancelled.data).not.toHaveProperty("refunded_amount")

        // One at a time: each request starts only when it is awaited.
        for (const refused of [
          () => api.post(`/providers/me/resources/${sophea.id}`, { schedules: [] }, auth),
          () => api.post(`/providers/me/resources/${sophea.id}/days-off`, { date: monday }, auth),
          () => api.delete(`/providers/me/resources/${sophea.id}/days-off/${monday}`, auth),
          () => api.post("/providers/me/services", { title: "My own", lengths: [{ minutes: 30, price: 1 }] }, auth),
        ]) {
          const res = await call(refused())
          expect(res.status).toBe(400)
          expect(res.data.message).toBe(PARTNERS_ONLY_MESSAGE)
        }
      })

      it("the shop shows an approved partner's public page with their published services only", async () => {
        const dara = await partner("dara@clinic.test", "Dr. Dara")
        await api.post("/providers/me", { bio: "General practice.", area: "Siem Reap", phone: "+855 12 345 678" }, dara.auth)
        const shown = (await api.post("/providers/me/services", { title: "Consultation", lengths: [{ minutes: 30, price: 10 }] }, dara.auth)).data.service
        const hidden = (await api.post("/providers/me/services", { title: "Home visit", lengths: [{ minutes: 60, price: 30 }] }, dara.auth)).data.service
        await api.post(`/providers/me/services/${hidden.id}`, { status: "draft" }, dara.auth)

        const page = await call(api.get(`/store/booking/providers/${dara.provider.handle}`, store))
        expect(page.status).toBe(200)
        expect(page.data.provider).toEqual({
          handle: "dr-dara",
          name: "Dr. Dara",
          bio: "General practice.",
          photo: null,
          area: "Siem Reap",
          services: [expect.objectContaining({ id: shown.id, title: "Consultation", handle: expect.any(String) })],
        })
        // Public data only: no email, phone, rate or status.
        expect(JSON.stringify(page.data)).not.toMatch(/clinic\.test|345 678|commission|status/)
        // A publishable key is required, as on every store route.
        expect((await call(api.get(`/store/booking/providers/${dara.provider.handle}`))).status).toBe(400)

        // Suspended, unknown, pending or staff: nothing.
        await api.post(`/admin/booking/providers/${dara.provider.id}`, { status: "suspended" }, admin)
        expect((await call(api.get(`/store/booking/providers/${dara.provider.handle}`, store))).status).toBe(404)
        expect((await call(api.get("/store/booking/providers/nobody", store))).status).toBe(404)
        await api.post("/providers", { name: "Waiting" }, bearer(await register("waiting@clinic.test")))
        expect((await call(api.get("/store/booking/providers/waiting", store))).status).toBe(404)
        const [sophea] = await booking().listBookingResources({ name: "Sophea" })
        await staff("sophea@spa.test", "Sophea", sophea.id)
        expect((await call(api.get("/store/booking/providers/sophea", store))).status).toBe(404)
      })

      it("a provider's password reset link opens the portal", async () => {
        const email = "dara@clinic.test"
        await partner(email, "Dr. Dara")
        await api.post("/auth/provider/emailpass/reset-password", { identifier: email }, { headers: freshIp() })
        const query = getContainer().resolve("query")
        let url: URL | null = null
        for (let i = 0; i < 40 && !url; i++) {
          const { data } = await query.graph({
            entity: "notification",
            fields: ["data"],
            filters: { to: email, template: PASSWORD_RESET_TEMPLATE },
          })
          const link = (data[0]?.data as { url?: string } | undefined)?.url
          url = link ? new URL(link) : null
          if (!url) await new Promise((r) => setTimeout(r, 250))
        }
        expect(url!.origin + url!.pathname).toEqual(`${PORTAL}/reset-password`)
        // The token sets a new password (at least 8 characters).
        const token = url!.searchParams.get("token")!
        const short = await call(api.post("/auth/provider/emailpass/update", { email, password: "short" }, bearer(token)))
        expect(short.status).toBe(400)
        const ok = await call(api.post("/auth/provider/emailpass/update", { email, password: "new-provider-pass-2" }, bearer(token)))
        expect(ok.status).toBe(200)
        const signedIn = await api.post("/auth/provider/emailpass", { email, password: "new-provider-pass-2" }, { headers: freshIp() })
        expect(typeof signedIn.data.token).toBe("string")
      })

      it("staff get a reset link from the admin, without email", async () => {
        const [sophea] = await booking().listBookingResources({ name: "Sophea" })
        const email = "kk@spa.test"
        // Still invited: nothing to reset, the invite code is the way in.
        const invited = await call(api.post("/admin/booking/providers", { name: "KK", email, resource_id: sophea.id }, admin))
        const id = invited.data.provider.id
        expect((await call(api.post(`/admin/booking/providers/${id}/reset-link`, {}, admin))).status).toBe(400)
        const list = await api.get("/admin/booking/providers", admin)
        expect(list.data.portal_url).toBe(PORTAL)
        await call(api.post("/providers/accept", { invite_code: invited.data.provider.invite_code }, bearer(await register(email))))
        await confirmEmail(email)
        const res = await call(api.post(`/admin/booking/providers/${id}/reset-link`, {}, admin))
        expect([res.status, res.data?.message]).toEqual([200, undefined])
        const url = new URL(res.data.link)
        expect(url.origin + url.pathname).toEqual(`${PORTAL}/reset-password`)
        const token = url.searchParams.get("token")!
        const ok = await call(api.post("/auth/provider/emailpass/update", { email, password: "new-staff-pass-1" }, bearer(token)))
        expect(ok.status).toBe(200)
        const signedIn = await api.post("/auth/provider/emailpass", { email, password: "new-staff-pass-1" }, { headers: freshIp() })
        expect(typeof signedIn.data.token).toBe("string")
      })
    })
  },
})
