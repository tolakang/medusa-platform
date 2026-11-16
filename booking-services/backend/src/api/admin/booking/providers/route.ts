import { inviteCode } from "@medusa-platform/medusa-core/lib/invite-code"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { inviteBookingStaffWorkflow } from "../../../../workflows/booking-provider"
import type { PostAdminBookingStaffInviteType } from "../validators"

// GET/POST /admin/booking/providers (TASKS P3-31): staff and partners, and
// staff invitations.
export const ADMIN_PROVIDER_FIELDS = [
  "id",
  "role",
  "status",
  "email",
  "name",
  "handle",
  "phone",
  "area",
  "commission_rate",
  "created_at",
  "resources.id",
  "resources.name",
  "resources.type",
]

type ProviderRow = { id: string; role: string; status: string } & Record<string, unknown>

// An open staff invitation shows its code, so the admin can give it again
// (nothing is stored: the code is derived from the id, core lib/invite-code).
export const withInviteCode = <T extends ProviderRow>(p: T) =>
  p.role === "staff" && p.status === "invited" ? { ...p, invite_code: inviteCode("provider", p.id) } : p

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking_provider",
    fields: ADMIN_PROVIDER_FIELDS,
    pagination: { order: { created_at: "DESC" } },
  })
  res.json({ providers: (data as ProviderRow[]).map(withInviteCode) })
}

// Invites a staff member: the answer carries the invite code to give them
// (no email is sent, as for POS cashiers).
export const POST = async (req: MedusaRequest<PostAdminBookingStaffInviteType>, res: MedusaResponse) => {
  const { result } = await inviteBookingStaffWorkflow(req.scope).run({ input: req.validatedBody })
  const {
    data: [provider],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking_provider",
    fields: ADMIN_PROVIDER_FIELDS,
    filters: { id: result.id },
  })
  res.status(201).json({ provider: withInviteCode(provider as ProviderRow) })
}
