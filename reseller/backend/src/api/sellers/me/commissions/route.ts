import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MathBN, MedusaError } from "@medusajs/framework/utils"
import { roundToCurrency } from "../../../../modules/seller/commission"
import { SELLER_MODULE } from "../../../../modules/seller"
import SellerModuleService from "../../../../modules/seller/service"
import { GetSellerCommissions } from "../../validators"

// GET /sellers/me/commissions (plan §9.5, TASKS P5-06): the seller's own
// commissions, newest first, with totals per status and currency.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  // A small custom query: parsed here (MEDUSA_SKILL §7, as POS pos-query.ts).
  const parsed = GetSellerCommissions.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
    )
  }
  const { status, limit, offset } = parsed.data
  const sellers = req.scope.resolve<SellerModuleService>(SELLER_MODULE)
  const filters = {
    seller_id: req.auth_context.actor_id,
    ...(status ? { status } : {}),
  }
  const [commissions, count] = await sellers.listAndCountSellerCommissions(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
    select: [
      "id",
      "order_id",
      "order_total",
      "rate",
      "amount",
      "currency_code",
      "status",
      "paid_at",
      "refunded_total",
      "adjusted_base",
      "created_at",
    ],
  })

  const all = await sellers.listSellerCommissions(
    { seller_id: req.auth_context.actor_id },
    { select: ["status", "currency_code", "amount"] }
  )
  // Summed exactly, rounded once per status and currency.
  const sums = new Map<string, ReturnType<typeof MathBN.convert>>()
  const totals: Record<string, Record<string, number>> = {}
  for (const c of all) {
    const key = `${c.status}:${c.currency_code}`
    const sum = MathBN.add(sums.get(key) ?? 0, c.amount)
    sums.set(key, sum)
    totals[c.status] ??= {}
    totals[c.status][c.currency_code] = roundToCurrency(sum, c.currency_code)
  }

  res.json({ commissions, count, limit, offset, totals })
}
