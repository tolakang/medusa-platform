import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { inviteCode } from "@medusa-platform/medusa-core/lib/invite-code"
import { VERIFY_EMAIL_TEMPLATE } from "@medusa-platform/medusa-core/lib/auth-email"
import { PROVIDER_PENDING_MESSAGE, PROVIDER_SUSPENDED_MESSAGE } from "../../src/api/provider-auth"
import { DECLINE_REASON_MESSAGE, NOT_ACCEPTED_MESSAGE, STAFF_NO_COMMISSION_MESSAGE } from "../../src/api/admin/booking/providers/[id]/route"
import { PROVIDER_EMAIL_NOT_VERIFIED_MESSAGE } from "../../src/lib/provider-email"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import {
  NO_INVITATION_MESSAGE,
  PROVIDER_EMAIL_TAKEN_MESSAGE,
  RESOURCE_NOT_STAFF_MESSAGE,
  WRONG_INVITE_CODE_MESSAGE,
} from "../../src/workflows/booking-provider"

jest.setTimeout(120 * 1000)

const PORTAL = "https://providers.booking.test"

// TASKS P3-31 (plan §9.3 "Providers", D13): the `provider` actor. Staff are
// invited by the admin for a staff resource and accept with the invite code;
// partners sign up, confirm their email and wait for approval; every
// /providers route needs a signed-in active provider behind PROVIDER_CORS; an
// unapproved partner's resources offer no times.
medusaIntegrationTestRunner({
  env: { PROVIDER_CORS: PORTAL, SHOPPER_IP_SECRET: "test-ip-secret" },
  testSuite: ({ api, getContainer }) => {
    describe("booking providers (TASKS P3-31)", () => {
      let admin: { headers: Record<string, string> }

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )
      let ip = 0
      const freshIp = () => ({
        "x-shopper-ip-secret": "test-ip-secret",
        "x-shopper-ip": `10.1.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`,
      })
      const bearer = (token?: string): { headers: Record<string, string> } => ({
        headers: { ...freshIp(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      })
      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)

      // Confirms the sign-in email as the emailed link would (the link itself
      // is tested below).
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
      const register = async (email: string, password = "provider-pass-1") =>
        call(api.post("/auth/provider/emailpass/register", { email, password }, { headers: freshIp() }))
      const login = async (email: string, password = "provider-pass-1") =>
        (await api.post("/auth/provider/emailpass", { email, password }, { headers: freshIp() })).data
          .token as string

      beforeEach(async () => {
        const container = getContainer()
        const email = "admin@booking.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        const { data } = await api.post("/auth/user/emailpass", { email, password: "supersecret1" })
        admin = bearer(data.token)
      })

      const staffResource = (name = "Sophea") =>
        booking().createBookingResources({
          name,
          type: "staff",
          capacity: 1,
          timezone: "Asia/Phnom_Penh",
          schedules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: "09:00", end_time: "17:00" })),
        } as any)

      it("invites staff for an existing calendar; they accept with the code and see only their own", async () => {
        const sophea = await staffResource()
        const invited = await call(
          api.post("/admin/booking/providers", { name: "Sophea", email: "Sophea@Spa.test", resource_id: sophea.id }, admin)
        )
        expect(invited.status).toBe(201)
        const provider = invited.data.provider
        expect(provider).toEqual(
          expect.objectContaining({ role: "staff", status: "invited", email: "sophea@spa.test", handle: "sophea" })
        )
        expect(provider.invite_code).toEqual(inviteCode("provider", provider.id))
        expect(provider.resources.map((r: { id: string }) => r.id)).toEqual([sophea.id])

        // Inviting her calendar again, or her email again, is refused.
        const twice = await call(
          api.post("/admin/booking/providers", { name: "Other", email: "other@spa.test", resource_id: sophea.id }, admin)
        )
        expect(twice.data.message).toBe(RESOURCE_NOT_STAFF_MESSAGE)
        const sameEmail = await call(api.post("/admin/booking/providers", { name: "S", email: "sophea@spa.test" }, admin))
        expect(sameEmail.data.message).toBe(PROVIDER_EMAIL_TAKEN_MESSAGE)
        // The admin can't activate an invitation; she must accept it.
        const early = await call(api.post(`/admin/booking/providers/${provider.id}`, { status: "active" }, admin))
        expect(early.data.message).toBe(NOT_ACCEPTED_MESSAGE)

        const registered = await register("Sophea@Spa.test")
        const wrong = await call(api.post("/providers/accept", { invite_code: "AAAAA-AAAAA" }, bearer(registered.data.token)))
        expect(wrong.status).toBe(400)
        expect(wrong.data.message).toBe(WRONG_INVITE_CODE_MESSAGE)
        const accepted = await call(
          api.post("/providers/accept", { invite_code: provider.invite_code.toLowerCase() }, bearer(registered.data.token))
        )
        expect(accepted.status).toBe(200)
        expect(accepted.data.provider.status).toBe("active")
        // Staff don't see money.
        expect(accepted.data.provider).not.toHaveProperty("commission_rate")
        const rate = await call(api.post(`/admin/booking/providers/${provider.id}`, { commission_rate: 10 }, admin))
        expect(rate.data.message).toBe(STAFF_NO_COMMISSION_MESSAGE)

        // Sign-in asks for the email first (authVerificationsPerActor).
        const first = await call(
          api.post("/auth/provider/emailpass", { email: "Sophea@Spa.test", password: "provider-pass-1" }, { headers: freshIp() })
        )
        expect(first.data.verification_required).toBe(true)
        await confirmEmail("Sophea@Spa.test")
        const me = await call(api.get("/providers/me", bearer(await login("Sophea@Spa.test"))))
        expect(me.status).toBe(200)
        expect(me.data.provider.resources.map((r: { id: string }) => r.id)).toEqual([sophea.id])

        // An invitation is no longer listed with a code once accepted.
        const list = await api.get("/admin/booking/providers", admin)
        expect(list.data.providers[0]).not.toHaveProperty("invite_code")
      })

      it("a new staff member gets a new calendar; nobody uninvited can accept", async () => {
        const invited = await api.post("/admin/booking/providers", { name: "Dara", email: "dara@spa.test" }, admin)
        expect(invited.data.provider.resources).toEqual([
          expect.objectContaining({ name: "Dara", type: "staff" }),
        ])
        const stranger = await register("stranger@spa.test")
        const refused = await call(
          api.post("/providers/accept", { invite_code: invited.data.provider.invite_code }, bearer(stranger.data.token))
        )
        expect(refused.data.message).toBe(NO_INVITATION_MESSAGE)
      })

      it("a partner signs up, confirms through the portal's link and is approved; then suspended", async () => {
        const email = "Doctor@Clinic.test"
        const registered = await register(email)
        const created = await call(
          api.post("/providers", { name: "Dr. Dara Sok", area: "Siem Reap" }, bearer(registered.data.token))
        )
        expect(created.status).toBe(201)
        const partner = created.data.provider
        expect(partner).toEqual(
          expect.objectContaining({
            role: "partner",
            status: "pending",
            email: "doctor@clinic.test",
            handle: "dr-dara-sok",
            commission_rate: null,
          })
        )
        // The same registration can't make a second provider, and the body
        // can't choose the role or status.
        expect((await call(api.post("/providers", { name: "Again" }, bearer(registered.data.token)))).status).toBeGreaterThanOrEqual(400)
        const other = await register("other@clinic.test")
        expect((await call(api.post("/providers", { name: "X", status: "active" }, bearer(other.data.token)))).status).toBe(400)

        // Not confirmed: no approval; sign-in asks for the email.
        const refused = await call(api.post(`/admin/booking/providers/${partner.id}`, { status: "active" }, admin))
        expect(refused.data.message).toBe(PROVIDER_EMAIL_NOT_VERIFIED_MESSAGE)
        const first = await call(
          api.post("/auth/provider/emailpass", { email, password: "provider-pass-1" }, { headers: freshIp() })
        )
        expect(first.data.verification_required).toBe(true)
        await api.post(
          "/auth/verification/request",
          { entity_id: email, entity_type: "email", metadata: { actor: "provider" } },
          bearer(first.data.token)
        )
        const query = getContainer().resolve("query")
        let url: URL | null = null
        for (let i = 0; i < 40 && !url; i++) {
          const { data } = await query.graph({
            entity: "notification",
            fields: ["data"],
            filters: { to: email, template: VERIFY_EMAIL_TEMPLATE },
          })
          const link = (data[0]?.data as { url?: string } | undefined)?.url
          url = link ? new URL(link) : null
          if (!url) await new Promise((r) => setTimeout(r, 250))
        }
        expect(url!.origin + url!.pathname).toEqual(`${PORTAL}/verify-account`)
        await api.post("/auth/verification/confirm", { code: url!.searchParams.get("token") })

        // Pending: may read /providers/me, nothing else.
        const token = await login(email)
        expect((await call(api.get("/providers/me", bearer(token)))).status).toBe(200)
        const edit = await call(api.post("/providers/me", { bio: "GP" }, bearer(token)))
        expect(edit.status).toBe(403)
        expect(edit.data.message).toBe(PROVIDER_PENDING_MESSAGE)

        const approved = await call(
          api.post(`/admin/booking/providers/${partner.id}`, { status: "active", commission_rate: 12.5 }, admin)
        )
        expect(approved.status).toBe(200)
        expect(approved.data.provider).toEqual(expect.objectContaining({ status: "active", commission_rate: 12.5 }))
        const edited = await call(api.post("/providers/me", { bio: "General practice", phone: "+855 12 345 678" }, bearer(token)))
        expect(edited.status).toBe(200)
        expect(edited.data.provider).toEqual(expect.objectContaining({ bio: "General practice", commission_rate: 12.5 }))
        // A provider can't change their own status or rate.
        expect((await call(api.post("/providers/me", { status: "active" }, bearer(token)))).status).toBe(400)
        expect((await call(api.post("/providers/me", { commission_rate: 0 }, bearer(token)))).status).toBe(400)

        await api.post(`/admin/booking/providers/${partner.id}`, { status: "suspended" }, admin)
        const stopped = await call(api.get("/providers/me", bearer(token)))
        expect(stopped.status).toBe(401)
        expect(stopped.data.message).toBe(PROVIDER_SUSPENDED_MESSAGE)
      })

      it("the admin declines a pending partner with a reason", async () => {
        const registered = await register("declined@clinic.test")
        const partner = (await api.post("/providers", { name: "Declined Clinic" }, bearer(registered.data.token))).data.provider
        const noReason = await call(api.post(`/admin/booking/providers/${partner.id}`, { status: "suspended" }, admin))
        expect(noReason.status).toBe(400)
        expect(noReason.data.message).toBe(DECLINE_REASON_MESSAGE)
        const declined = await call(
          api.post(`/admin/booking/providers/${partner.id}`, { status: "suspended", status_reason: "No licence shown" }, admin)
        )
        expect(declined.status).toBe(200)
        expect(declined.data.provider).toEqual(expect.objectContaining({ status: "suspended", status_reason: "No licence shown" }))
      })

      it("an unapproved or suspended partner's calendar offers no times; staff calendars always do", async () => {
        const monday = "2030-01-07"
        const room = await staffResource("Clinic room")
        const registered = await register("gp@clinic.test")
        const created = await api.post("/providers", { name: "GP" }, bearer(registered.data.token))
        await booking().updateBookingResources({ id: room.id, provider_id: created.data.provider.id })
        const slots = async () =>
          (await booking().listFreeSlots({ resource_ids: [room.id], date: monday, duration_minutes: 60 })).length
        const check = () =>
          booking().checkSlot({
            resource_id: room.id,
            starts_at: new Date(`${monday}T03:00:00Z`),
            ends_at: new Date(`${monday}T04:00:00Z`),
          })

        expect(await slots()).toBe(0)
        const closed = await check()
        expect(closed.available).toBe(false)
        expect(!closed.available && closed.reason).toBe("resource_inactive")

        await confirmEmail("gp@clinic.test")
        await api.post(`/admin/booking/providers/${created.data.provider.id}`, { status: "active" }, admin)
        expect(await slots()).toBe(8)
        expect((await check()).available).toBe(true)

        await api.post(`/admin/booking/providers/${created.data.provider.id}`, { status: "suspended" }, admin)
        expect(await slots()).toBe(0)

        // Inviting a stylist never closes her calendar.
        const sophea = await staffResource()
        await api.post("/admin/booking/providers", { name: "Sophea", email: "s@spa.test", resource_id: sophea.id }, admin)
        expect(
          (await booking().listFreeSlots({ resource_ids: [sophea.id], date: monday, duration_minutes: 60 })).length
        ).toBe(8)
      })

      it("guards /providers: CORS for the portal, no customer or admin tokens", async () => {
        const preflight = await call(
          api.options("/providers/me", {
            headers: { origin: PORTAL, "access-control-request-method": "GET" },
          })
        )
        expect(preflight.headers["access-control-allow-origin"]).toBe(PORTAL)
        const foreign = await call(
          api.options("/providers/me", {
            headers: { origin: "https://evil.test", "access-control-request-method": "GET" },
          })
        )
        expect(foreign.headers["access-control-allow-origin"]).toBeUndefined()

        expect((await call(api.get("/providers/me", { headers: freshIp() }))).status).toBe(401)
        expect((await call(api.get("/providers/me", admin))).status).toBe(401)
        // Admin routes stay admin-only.
        const registered = await register("p@x.test")
        const created = await api.post("/providers", { name: "P" }, bearer(registered.data.token))
        await confirmEmail("p@x.test")
        const token = await login("p@x.test")
        expect((await call(api.get("/admin/booking/providers", bearer(token)))).status).toBe(401)
        expect(created.status).toBe(201)
      })
    })
  },
})
