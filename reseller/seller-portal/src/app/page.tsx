import Link from "next/link"
import { Shell } from "@/components/shell"
import { CopyButton } from "@/components/copy-button"
import { commissionLabel, day, money, NO_COMMISSION_LABEL, saleAmount, saleStatusLabel, shopUrl } from "@/lib/format"
import { requireSeller, sellerGet } from "@/lib/server/seller"

type Totals = Record<string, Record<string, number>>
type Order = {
  id: string
  display_id: number
  created_at: string
  currency_code: string
  status: string
  total: number
  paid_total?: number
  refunded_total?: number
  commission: { amount: number; status: string } | null
}

// TASKS P5-08: the seller's overview.
export default async function OverviewPage() {
  const { token, seller } = await requireSeller()
  const [{ totals }, { orders }, { products }] = await Promise.all([
    sellerGet<{ totals: Totals }>(token, "/sellers/me/commissions", { limit: "1" }),
    sellerGet<{ orders: Order[] }>(token, "/sellers/me/orders", { limit: "5" }),
    sellerGet<{ products: { selected: boolean }[] }>(token, "/sellers/me/products"),
  ])
  // Nothing yet in a status: zero in the shop's own currency (from any
  // commission or order), not "$0.00" in a riel shop.
  const shopCurrency =
    Object.values(totals).flatMap((byCurrency) => Object.keys(byCurrency))[0] ?? orders[0]?.currency_code
  const sum = (status: string) =>
    Object.entries(totals[status] ?? {})
      .map(([currency, amount]) => money(amount, currency))
      .join(" · ") || (shopCurrency ? money(0, shopCurrency) : "0")

  const link = shopUrl(seller.domain)
  return (
    <Shell seller={seller} active="/">
      {link && (
        <section className="card flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ui-fg-subtle">Your shop</p>
            <p className="truncate font-medium">{link}</p>
          </div>
          <a className="btn-primary" href={link} target="_blank" rel="noopener noreferrer">
            Open my shop
          </a>
          <CopyButton text={link} />
        </section>
      )}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Waiting for approval", value: sum("pending") },
          { label: "Due in the next payout", value: sum("approved") },
          { label: "Paid to you", value: sum("paid") },
        ].map((tile) => (
          <div key={tile.label} className="card p-4">
            <p className="text-sm text-ui-fg-subtle">{tile.label}</p>
            <p className="mt-1 text-lg font-semibold">{tile.value}</p>
          </div>
        ))}
      </section>

      <section className="card p-4 text-sm">
        <h2 className="mb-2 font-semibold">Your shop</h2>
        <dl className="grid gap-1 sm:grid-cols-[10rem_1fr]">
          <dt className="text-ui-fg-subtle">Domain</dt>
          <dd>{seller.domain ?? "Not set yet. Ask the shop."}</dd>
          <dt className="text-ui-fg-subtle">Commission rate</dt>
          <dd>{seller.commission_rate === null ? "The shop's default rate" : `${seller.commission_rate} %`}</dd>
          <dt className="text-ui-fg-subtle">Products shown</dt>
          <dd>
            {products.filter((p) => p.selected).length} of {products.length}{" "}
            <Link className="text-ui-fg-interactive" href="/products">
              Choose
            </Link>
          </dd>
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Latest sales</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-ui-fg-subtle">No orders in your shop yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Status</th>
                <th>Total</th>
                <th>Your commission</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.display_id}</td>
                  <td>{day(order.created_at)}</td>
                  <td>{saleStatusLabel(order)}</td>
                  <td>{money(saleAmount(order), order.currency_code)}</td>
                  <td>
                    {order.commission
                      ? `${money(order.commission.amount, order.currency_code)} (${commissionLabel(order.commission.status)})`
                      : NO_COMMISSION_LABEL}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </Shell>
  )
}
