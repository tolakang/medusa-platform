import Link from "next/link"
import { Pager, Shell } from "@/components/shell"
import { COMMISSION_STATUSES, commissionLabel, commissionStatus, day, money, pageFrom } from "@/lib/format"
import { requireSeller, sellerGet } from "@/lib/server/seller"

type Commission = {
  id: string
  order_id: string
  order_total: number
  rate: number
  amount: number
  currency_code: string
  status: string
  paid_at: string | null
  refunded_total?: number | null
  adjusted_base?: number | null
  created_at: string
}
type Payout = {
  id: string
  currency_code: string
  amount: number
  commission_total: number
  adjustment_total: number
  commission_count: number
  reference: string | null
  paid_at: string
}
type Adjustment = {
  id: string
  amount: number
  currency_code: string
  reason: string
  status: "open" | "settled"
  created_at: string
}

const LIMIT = 20

// TASKS P5-08: what you earned per order. Pending → approved on the payout
// day → paid when the shop has paid you (P5-05).
export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>
}) {
  const { token, seller } = await requireSeller()
  const params = await searchParams
  const page = pageFrom(params.page)
  const status = commissionStatus(params.status)
  const payoutsData = sellerGet<{ payouts: Payout[]; adjustments: Adjustment[]; next_payout_date: string }>(
    token,
    "/sellers/me/payouts"
  )
  const { commissions, count, totals } = await sellerGet<{
    commissions: Commission[]
    count: number
    totals: Record<string, Record<string, number>>
  }>(token, "/sellers/me/commissions", {
    limit: String(LIMIT),
    offset: String((page - 1) * LIMIT),
    ...(status ? { status } : {}),
  })

  const { payouts, adjustments, next_payout_date } = await payoutsData

  return (
    <Shell seller={seller} active="/commissions">
      <p className="text-sm text-ui-fg-subtle">
        Next payout day: <strong>{day(next_payout_date)}</strong>. Due commissions are paid after it.
      </p>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Status">
        <Link className={!status ? "btn-primary" : "btn-secondary"} href="/commissions">
          All
        </Link>
        {COMMISSION_STATUSES.map((s) => (
          <Link key={s} className={status === s ? "btn-primary" : "btn-secondary"} href={`/commissions?status=${s}`}>
            {commissionLabel(s)}
            {totals[s] &&
              ` · ${Object.entries(totals[s]).map(([c, a]) => money(a, c)).join(" · ")}`}
          </Link>
        ))}
      </nav>
      <section className="card overflow-x-auto p-4">
        {commissions.length === 0 ? (
          <p className="text-sm text-ui-fg-subtle">No commissions here yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Base</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Paid on</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id}>
                  <td>{day(c.created_at)}</td>
                  <td>
                    {/* After a refund: the base the commission is now on, and what was refunded. */}
                    {c.refunded_total != null && Number(c.refunded_total) > 0 ? (
                      <>
                        {money(c.adjusted_base ?? 0, c.currency_code)}
                        <span className="block text-xs text-ui-fg-subtle">
                          was {money(c.order_total, c.currency_code)}; {money(c.refunded_total, c.currency_code)} refunded
                        </span>
                      </>
                    ) : (
                      money(c.order_total, c.currency_code)
                    )}
                  </td>
                  <td>{c.rate} %</td>
                  <td>{money(c.amount, c.currency_code)}</td>
                  <td>{commissionLabel(c.status)}</td>
                  <td>{day(c.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Pager path="/commissions" page={page} count={count} limit={LIMIT} extra={status ? `&status=${status}` : ""} />

      {adjustments.length > 0 && (
        <section className="card overflow-x-auto p-4">
          <h2 className="mb-1 font-semibold">Adjustments</h2>
          <p className="mb-2 text-sm text-ui-fg-subtle">
            Orders refunded or cancelled after their commission was paid to you. Open ones come off your next payout.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <td>{day(a.created_at)}</td>
                  <td>{a.reason}</td>
                  <td>{money(a.amount, a.currency_code)}</td>
                  <td>{a.status === "open" ? "Taken off the next payout" : "Settled"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-2 font-semibold">Payouts</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-ui-fg-subtle">No payouts yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Paid on</th>
                <th>Sales</th>
                <th>Amount</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{day(p.paid_at)}</td>
                  <td>{p.commission_count}</td>
                  <td>
                    {money(p.amount, p.currency_code)}
                    {Number(p.adjustment_total) !== 0 && (
                      <span className="block text-xs text-ui-fg-subtle">
                        {money(p.adjustment_total, p.currency_code)} adjustments
                      </span>
                    )}
                  </td>
                  <td className="font-mono text-xs">{p.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Shell>
  )
}
