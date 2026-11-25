import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SELLER_MODULE } from "../../../modules/seller"
import { netPayoutLines, nextPayoutDate, summarizeBySeller } from "../../../modules/seller/payout"
import SellerModuleService from "../../../modules/seller/service"

// GET /admin/seller-payouts (TASKS P5-05): the payout report. `due` =
// approved commissions (to pay now) with the open adjustments (clawbacks)
// carried into the payout and the net to pay; `pending` = not yet approved
// (next payout day, `next_payout_date`); `adjustments` = open clawbacks of
// sellers with nothing approved; `history` = the latest recorded payouts.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const sellers = req.scope.resolve<SellerModuleService>(SELLER_MODULE)
  const [approved, pending, open, all, history] = await Promise.all([
    sellers.listSellerCommissions({ status: "approved" }),
    sellers.listSellerCommissions({ status: "pending" }),
    sellers.listSellerAdjustments({ status: "open" }),
    sellers.listSellers({}),
    sellers.listSellerPayouts({}, { order: { paid_at: "DESC" }, take: 50 }),
  ])
  const names = new Map(
    all.map((s) => [s.id, { handle: s.handle, name: s.name, payout_hold: s.payout_hold }])
  )
  const withNames = <T extends { seller_id: string }>(lines: T[]) =>
    lines.map((line) => ({ ...line, seller: names.get(line.seller_id) ?? null }))
  const plain = (list: { seller_id: string; currency_code: string; amount: unknown }[]) =>
    list.map((c) => ({ seller_id: c.seller_id, currency_code: c.currency_code, amount: Number(c.amount) }))

  const due = netPayoutLines(plain(approved), plain(open))
  const dueKeys = new Set(due.map((line) => `${line.seller_id}:${line.currency_code}`))
  res.json({
    due: withNames(due),
    pending: withNames(summarizeBySeller(plain(pending))),
    adjustments: withNames(
      summarizeBySeller(plain(open)).filter((line) => !dueKeys.has(`${line.seller_id}:${line.currency_code}`))
    ),
    history: withNames(
      history.map((p) => ({
        id: p.id,
        seller_id: p.seller_id,
        currency_code: p.currency_code,
        amount: Number(p.amount),
        commission_total: Number(p.commission_total),
        adjustment_total: Number(p.adjustment_total),
        commission_count: p.commission_count,
        reference: p.reference,
        paid_at: p.paid_at,
      }))
    ),
    next_payout_date: nextPayoutDate(new Date()).toISOString(),
  })
}
