import { inviteCodeMatches } from "@medusa-platform/medusa-core/lib/invite-code"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"
import { defaultTimezone } from "./booking-resource"

// Providers (BUILD_PLAN §9.3 "Providers", D13, TASKS P3-31): the actor type
// `provider`, from the docs guide "How to Create an Actor Type" with this
// repo's two patterns:
// - staff are invite-only, as POS cashiers: an admin creates the provider for
//   a staff resource, and the registered email must match that invitation
//   AND carry its invite code (F-036, review fix B11);
// - partners sign up on their own, as Marketplace vendors: the email comes
//   from the auth identity, never the body (F-074), and they wait for the
//   admin's approval.

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

// "Dr. Dara Sok" → "dr-dara-sok". Empty if the name has no letters or digits.
export const handleFromName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

export const PROVIDER_EMAIL_TAKEN_MESSAGE = "This email already belongs to a provider."
export const PROVIDER_HANDLE_TAKEN_MESSAGE = "This page name is taken. Choose another one."
export const NO_EMAIL_MESSAGE =
  "Sign-up needs an email and password registration (/auth/provider/emailpass/register)."
export const NO_INVITATION_MESSAGE =
  "There is no open staff invitation for this email. Ask the shop admin to invite you."
export const WRONG_INVITE_CODE_MESSAGE =
  "This invite code isn't right. Ask the shop admin for the code of your invitation."
export const RESOURCE_NOT_STAFF_MESSAGE =
  "Staff are invited for a staff resource that has no provider yet."

const service = (container: { resolve: (key: string) => unknown }) =>
  container.resolve(BOOKING_MODULE) as BookingModuleService

// A free handle: the wanted one, else it with -2, -3, … (staff are invited by
// name, so two "Sophea"s must not fail). An explicit handle must be free.
async function freeHandle(booking: BookingModuleService, wanted: string, explicit: boolean) {
  const base = wanted || "provider"
  for (let n = 1; n < 100; n++) {
    const handle = n === 1 ? base : `${base}-${n}`
    const [taken] = await booking.listBookingProviders({ handle }, { withDeleted: true })
    if (!taken) {
      return handle
    }
    if (explicit) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, PROVIDER_HANDLE_TAKEN_MESSAGE)
    }
  }
  throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, PROVIDER_HANDLE_TAKEN_MESSAGE)
}

async function assertEmailFree(booking: BookingModuleService, email: string) {
  const [taken] = await booking.listBookingProviders({ email })
  if (taken) {
    throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, PROVIDER_EMAIL_TAKEN_MESSAGE)
  }
}

// The email an emailpass auth identity registered with (provider identity
// entity_id), lowercase.
const registeredEmailStep = createStep(
  "registered-email",
  async (authIdentityId: string, { container }) => {
    const identity = await container
      .resolve(Modules.AUTH)
      .retrieveAuthIdentity(authIdentityId, { relations: ["provider_identities"] })
    const email = identity.provider_identities?.find((p) => p.provider === "emailpass")?.entity_id
    if (!email) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NO_EMAIL_MESSAGE)
    }
    return new StepResponse(normalizeEmail(email))
  }
)

// --- Staff invitation (admin) ---

export type InviteStaffInput = {
  name: string
  email: string
  // An existing staff resource with no provider (owner, 2026-11-16: "Pick a
  // resource"); without it a new staff resource is made for them.
  resource_id?: string
  timezone?: string
}

const inviteStaffStep = createStep(
  "invite-staff",
  async (input: InviteStaffInput, { container }) => {
    const booking = service(container)
    const email = normalizeEmail(input.email)
    const name = input.name.trim()
    await assertEmailFree(booking, email)
    if (input.resource_id) {
      const [resource] = await booking.listBookingResources({ id: input.resource_id })
      if (!resource || resource.type !== "staff" || resource.provider_id) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, RESOURCE_NOT_STAFF_MESSAGE)
      }
    }
    const provider = await booking.createBookingProviders({
      role: "staff",
      status: "invited",
      email,
      name,
      handle: await freeHandle(booking, handleFromName(name), false),
    })
    let createdResourceId: string | null = null
    if (input.resource_id) {
      await booking.updateBookingResources({ id: input.resource_id, provider_id: provider.id })
    } else {
      const resource = await booking.createBookingResources({
        name,
        type: "staff",
        capacity: 1,
        timezone: input.timezone ?? defaultTimezone(),
        provider_id: provider.id,
      })
      createdResourceId = resource.id
    }
    return new StepResponse(provider, {
      providerId: provider.id,
      linkedResourceId: input.resource_id ?? null,
      createdResourceId,
    })
  },
  async (created, { container }) => {
    if (!created) {
      return
    }
    const booking = service(container)
    if (created.linkedResourceId) {
      await booking.updateBookingResources({ id: created.linkedResourceId, provider_id: null })
    }
    if (created.createdResourceId) {
      await booking.deleteBookingResources(created.createdResourceId)
    }
    await booking.deleteBookingProviders(created.providerId)
  }
)

export const inviteBookingStaffWorkflow = createWorkflow(
  "invite-booking-staff",
  function (input: InviteStaffInput) {
    return new WorkflowResponse(inviteStaffStep(input))
  }
)

// --- Staff accept (the invited person, with a registration token) ---

const findInvitedStaffStep = createStep(
  "find-invited-staff",
  async (input: { email: string; invite_code: string }, { container }) => {
    const [provider] = await service(container).listBookingProviders({
      email: input.email,
      role: "staff",
      status: "invited",
    })
    if (!provider) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NO_INVITATION_MESSAGE)
    }
    // The email alone proves nothing (anyone can register it first).
    if (!inviteCodeMatches("provider", provider.id, input.invite_code)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, WRONG_INVITE_CODE_MESSAGE)
    }
    return new StepResponse(provider)
  }
)

const activateStaffStep = createStep(
  "activate-staff",
  async (id: string, { container }) => {
    const provider = await service(container).updateBookingProviders({ id, status: "active" })
    return new StepResponse(provider, id)
  },
  async (id, { container }) => {
    if (id) {
      await service(container).updateBookingProviders({ id, status: "invited" })
    }
  }
)

// Links the auth identity to the invitation (app_metadata.provider_id). The
// core step refuses an identity that already has a provider and undoes itself
// if a later step fails.
export const acceptBookingStaffInviteWorkflow = createWorkflow(
  "accept-booking-staff-invite",
  function (input: { auth_identity_id: string; invite_code: string }) {
    const email = registeredEmailStep(input.auth_identity_id)
    const invited = findInvitedStaffStep(
      transform({ email, input }, ({ email, input }) => ({ email, invite_code: input.invite_code }))
    )
    setAuthAppMetadataStep({
      authIdentityId: input.auth_identity_id,
      actorType: "provider",
      value: invited.id,
    })
    return new WorkflowResponse(activateStaffStep(invited.id))
  }
)

// --- Partner sign-up (anyone, with a registration token) ---

export type CreatePartnerInput = {
  auth_identity_id: string
  name: string
  handle?: string
  phone?: string | null
  bio?: string | null
  area?: string | null
}

const createPartnerStep = createStep(
  "create-partner",
  async (input: Omit<CreatePartnerInput, "auth_identity_id"> & { email: string }, { container }) => {
    const booking = service(container)
    await assertEmailFree(booking, input.email)
    const name = input.name.trim()
    const provider = await booking.createBookingProviders({
      role: "partner",
      status: "pending",
      email: input.email,
      name,
      handle: await freeHandle(booking, input.handle ?? handleFromName(name), !!input.handle),
      phone: input.phone ?? null,
      bio: input.bio ?? null,
      area: input.area ?? null,
    })
    // Their own calendar (P3-32): no hours yet, and it offers no times until
    // the partner is approved (providerServes).
    const resource = await booking.createBookingResources({
      name,
      type: "staff",
      capacity: 1,
      timezone: defaultTimezone(),
      provider_id: provider.id,
    })
    return new StepResponse(provider, { providerId: provider.id, resourceId: resource.id })
  },
  async (created, { container }) => {
    if (created) {
      const booking = service(container)
      await booking.deleteBookingResources(created.resourceId)
      await booking.deleteBookingProviders(created.providerId)
    }
  }
)

export const createBookingPartnerWorkflow = createWorkflow(
  "create-booking-partner",
  function (input: CreatePartnerInput) {
    const email = registeredEmailStep(input.auth_identity_id)
    const data = transform({ input, email }, ({ input, email }) => {
      const { auth_identity_id: _, ...rest } = input
      return { ...rest, email }
    })
    const provider = createPartnerStep(data)
    setAuthAppMetadataStep({
      authIdentityId: input.auth_identity_id,
      actorType: "provider",
      value: provider.id,
    })
    return new WorkflowResponse(provider)
  }
)

// --- Updates (admin: status, rate; the provider: their profile) ---

export type UpdateProviderInput = {
  id: string
  name?: string
  phone?: string | null
  bio?: string | null
  photo?: string | null
  area?: string | null
  status?: "active" | "suspended"
  status_reason?: string | null
  commission_rate?: number | null
}

const updateProviderStep = createStep(
  "update-provider",
  async (input: UpdateProviderInput, { container }) => {
    const booking = service(container)
    const [before] = await booking.listBookingProviders({ id: input.id })
    if (!before) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Provider ${input.id} was not found.`)
    }
    const { id, ...changes } = input
    const provider = await booking.updateBookingProviders({ id, ...changes })
    const previous = Object.fromEntries(
      Object.keys(changes).map((k) => [k, (before as Record<string, unknown>)[k]])
    )
    return new StepResponse(provider, { id, ...previous })
  },
  async (previous, { container }) => {
    if (previous) {
      await service(container).updateBookingProviders(previous as UpdateProviderInput)
    }
  }
)

export const updateBookingProviderWorkflow = createWorkflow(
  "update-booking-provider",
  function (input: UpdateProviderInput) {
    return new WorkflowResponse(updateProviderStep(input))
  }
)
