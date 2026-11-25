import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { inviteCode } from "@medusa-platform/medusa-core/lib/invite-code"
import { createSellerWorkflow } from "../../../workflows/seller/create-seller"
import type { PostAdminSellerType } from "./validators"

/** The invite code while the seller is still invited; null once accepted. */
export const withInviteCode = <T extends { id: string; accepted_at?: unknown }>(seller: T) => ({
  ...seller,
  invite_code: seller.accepted_at ? null : inviteCode("seller", seller.id),
})

export const SELLER_FIELDS = [
  "id",
  "handle",
  "name",
  "email",
  "domain",
  "status",
  "commission_rate",
  "accepted_at",
  "payout_hold",
  "phone",
  "telegram",
  "payout_bank_name",
  "payout_account_name",
  "payout_account_number",
  "created_at",
  "sales_channel.id",
  "sales_channel.name",
]

const GetAdminSellers = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /admin/sellers (TASKS P5-03): sellers with their sales channel, newest
// first, a page at a time (design critique, 2026-11-23).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const parsed = GetAdminSellers.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues[0].message)
  }
  const { limit, offset } = parsed.data
  const { data: sellers, metadata } = await req.scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "seller",
      fields: SELLER_FIELDS,
      pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
    })
  // The invite code is the shop's to hand to each seller (REVIEW_FIXES B11),
  // until they accept and set a password: then it is spent, and not shown.
  res.json({
    sellers: sellers.map(withInviteCode),
    count: metadata?.count ?? sellers.length,
    limit,
    offset,
  })
}

// POST /admin/sellers (TASKS P5-03): invites a seller. Creates the seller with
// their own sales channel and publishable key (createSellerWorkflow, P5-02);
// the seller then registers with this email and accepts (/sellers/accept)
// with the `invite_code` returned here.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminSellerType>,
  res: MedusaResponse
) => {
  const { result } = await createSellerWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  const {
    data: [seller],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "seller",
    fields: SELLER_FIELDS,
    filters: { id: result.seller.id },
  })
  res.json({
    seller,
    publishable_key: result.publishable_key.token,
    invite_code: inviteCode("seller", result.seller.id),
  })
}
