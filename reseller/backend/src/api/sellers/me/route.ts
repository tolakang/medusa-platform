import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { SELLER_MODULE } from "../../../modules/seller"
import SellerModuleService from "../../../modules/seller/service"
import { isValidPhone, PHONE_MESSAGE } from "@medusa-platform/medusa-core/lib/phone"

// GET /sellers/me (plan §9.5; TASKS P5-03): the signed-in seller and their
// sales channel. P5-06 adds products and commissions.
const meOf = async (req: AuthenticatedMedusaRequest) => {
  const {
    data: [seller],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "seller",
      fields: [
        "id",
        "handle",
        "name",
        "email",
        "domain",
        "status",
        "commission_rate",
        "phone",
        "telegram",
        "payout_bank_name",
        "payout_account_name",
        "payout_account_number",
        "sales_channel.id",
        "sales_channel.name",
      ],
      filters: { id: req.auth_context.actor_id },
    },
    { throwIfKeyNotFound: true }
  )
  return seller
}

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ seller: await meOf(req) })
}

// Empty text clears the field.
const Optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null))

// POST /sellers/me (gap review 2026-11-24): the seller changes their shop
// name, contact details (phone, Telegram) and where they are paid (bank or
// ABA account). Domain, handle and rate stay the shop owner's.
export const PostSellerMe = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    // Digits only, as checkout phones (medusa-core lib/phone; browser test 2026-11-26).
    phone: Optional(40).refine((value) => isValidPhone(value), PHONE_MESSAGE),
    telegram: Optional(64),
    payout_bank_name: Optional(80),
    payout_account_name: Optional(120),
    payout_account_number: Optional(40),
  })
  .strict()

export const POST = async (req: AuthenticatedMedusaRequest<z.infer<typeof PostSellerMe>>, res: MedusaResponse) => {
  const changes = Object.fromEntries(
    Object.entries(req.validatedBody).filter(([, value]) => value !== undefined)
  )
  await req.scope
    .resolve<SellerModuleService>(SELLER_MODULE)
    .updateSellers({ id: req.auth_context.actor_id, ...changes })
  res.json({ seller: await meOf(req) })
}
