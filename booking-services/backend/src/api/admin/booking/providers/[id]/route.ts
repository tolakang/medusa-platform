import { emailVerified } from "@medusa-platform/medusa-core/lib/email-verified"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { PROVIDER_EMAIL_NOT_VERIFIED_MESSAGE } from "../../../../../lib/provider-email"
import { updateBookingProviderWorkflow } from "../../../../../workflows/booking-provider"
import type { PostAdminBookingProviderType } from "../../validators"
import { ADMIN_PROVIDER_FIELDS, withInviteCode } from "../route"

export const NOT_ACCEPTED_MESSAGE =
  "This staff member hasn't accepted the invitation yet. Give them the invite code."
export const STAFF_NO_COMMISSION_MESSAGE = "Staff earn no commission; rates are for partners."

type ProviderRow = { id: string; role: string; status: string; email: string } & Record<string, unknown>

const providerById = async (req: MedusaRequest, id: string) => {
  const {
    data: [provider],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    { entity: "booking_provider", fields: ADMIN_PROVIDER_FIELDS, filters: { id } },
    { throwIfKeyNotFound: true }
  )
  return provider as ProviderRow
}

// GET /admin/booking/providers/:id (TASKS P3-31).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.json({ provider: withInviteCode(await providerById(req, req.params.id)) })
}

// POST /admin/booking/providers/:id: approve (`status: "active"`), suspend or
// reactivate a provider, rename them, or set a partner's commission rate.
export const POST = async (req: MedusaRequest<PostAdminBookingProviderType>, res: MedusaResponse) => {
  const provider = await providerById(req, req.params.id)
  const body = req.validatedBody
  if (body.status === "active" && provider.status === "invited") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_ACCEPTED_MESSAGE)
  }
  // Approval needs the partner's confirmed sign-in email, so a partner signed
  // up with someone else's address can't go live (as Marketplace vendors).
  if (body.status === "active" && provider.role === "partner" && provider.status !== "active") {
    if (!(await emailVerified(req.scope, provider.email))) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PROVIDER_EMAIL_NOT_VERIFIED_MESSAGE)
    }
  }
  if (body.commission_rate !== undefined && provider.role !== "partner") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, STAFF_NO_COMMISSION_MESSAGE)
  }
  await updateBookingProviderWorkflow(req.scope).run({ input: { id: provider.id, ...body } })
  res.json({ provider: withInviteCode(await providerById(req, provider.id)) })
}
