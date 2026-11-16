import { Shell } from "@/components/shell"
import { money } from "@/lib/format"
import { providerGet, requirePartner } from "@/lib/server/provider"
import { dayLabel, toLocalTime } from "@/lib/time"

type Earnings = {
  commissions: {
    id: string
    line_total: number
    rate: number
    amount: number
    payout_amount: number
    currency_code: string
    status: "pending" | "approved" | "paid" | "cancelled"
    refund_review: "none" | "to_review" | "settled"
    booking: { starts_at: string; timezone: string; order_display_id: number | null } | null
  }[]
  payouts: { id: string; amount: number; currency_code: string; period: string; status: string; paid_at: string | null; reference: string | null }[]
  not_yet_paid_out: { currency_code: string; amount: number }[]
}

const STATUS: Record<string, string> = {
  pending: "Next payout",
  approved: "In a payout",
  paid: "Paid",
  cancelled: "Cancelled (refunded)",
}

// TASKS P3-33: what a partner earns: each booking with the shop's commission
// and what they are owed, their monthly payouts, and what isn't paid out yet.
export default async function EarningsPage() {
  const { token, provider } = await requirePartner()
  if (provider.status !== "active") {
    return <Shell provider={provider} active="/earnings">{null}</Shell>
  }
  const data = await providerGet<Earnings>(token, "/providers/me/earnings")
  return (
    <Shell provider={provider} active="/earnings">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-sm text-ui-fg-subtle">Earned, not paid out yet</p>
          {data.not_yet_paid_out.length ? (
            data.not_yet_paid_out.map((o) => (
              <p key={o.currency_code} className="text-3xl font-semibold">
                {money(o.amount, o.currency_code)}
              </p>
            ))
          ) : (
            <p className="text-3xl font-semibold">—</p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-sm text-ui-fg-subtle">Shop&apos;s commission</p>
          <p className="text-3xl font-semibold">
            {provider.commission_rate == null ? "Default rate" : `${provider.commission_rate}%`}
          </p>
        </div>
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Payouts</h2>
        {data.payouts.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.payouts.map((p) => (
                <tr key={p.id}>
                  <td>{p.period}</td>
                  <td>{money(p.amount, p.currency_code)}</td>
                  <td>{p.status === "paid" ? `Paid${p.reference ? ` · ${p.reference}` : ""}` : "On its way"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-ui-fg-subtle">No payouts yet. The shop pays each month for the month before.</p>
        )}
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Bookings</h2>
        {data.commissions.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Paid by customer</th>
                  <th>Commission</th>
                  <th>Yours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.commissions.map((c) => {
                  const b = c.booking
                  const local = b ? toLocalTime(new Date(b.starts_at), b.timezone) : null
                  const when = local ? `${dayLabel(local.date)} ${local.time}` : ""
                  return (
                    <tr key={c.id}>
                      <td>
                        {when}
                        {b?.order_display_id ? <span className="text-ui-fg-subtle"> · #{b.order_display_id}</span> : null}
                      </td>
                      <td>{money(c.line_total, c.currency_code)}</td>
                      <td>
                        {money(c.amount, c.currency_code)} ({c.rate}%)
                      </td>
                      <td>{money(c.payout_amount, c.currency_code)}</td>
                      <td>{c.refund_review === "to_review" ? "On hold (refund)" : STATUS[c.status]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ui-fg-subtle">No paid bookings yet.</p>
        )}
      </section>
    </Shell>
  )
}
