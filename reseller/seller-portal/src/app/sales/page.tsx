import { Pager, Shell } from "@/components/shell"
import Link from "next/link"
import {
  commissionLabel,
  day,
  money,
  NO_COMMISSION_LABEL,
  pageFrom,
  saleAmount,
  saleStatusLabel,
} from "@/lib/format"
import { requireSeller, sellerGet } from "@/lib/server/seller"

type Order = {
  id: string
  display_id: number
  created_at: string
  status: string
  currency_code: string
  total: number
  paid_total?: number
  refunded_total?: number
  items: { title: string; quantity: number }[]
  commission: { amount: number; status: string } | null
}

const LIMIT = 20

const commissionText = (order: Order) =>
  order.commission
    ? `${money(order.commission.amount, order.currency_code)} (${commissionLabel(order.commission.status)})`
    : NO_COMMISSION_LABEL

const refundedText = (order: Order) =>
  Number(order.refunded_total ?? 0) > 0 ? `${money(order.refunded_total, order.currency_code)} refunded` : null

// TASKS P5-08: orders placed in your shop. The shop ships them. A table on
// wide screens, cards on phones (role test 2026-11-25).
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { token, seller } = await requireSeller()
  const page = pageFrom((await searchParams).page)
  const { orders, count } = await sellerGet<{ orders: Order[]; count: number }>(
    token,
    "/sellers/me/orders",
    { limit: String(LIMIT), offset: String((page - 1) * LIMIT) }
  )
  return (
    <Shell seller={seller} active="/sales">
      {orders.length === 0 ? (
        <section className="card p-4">
          <p className="text-sm text-ui-fg-subtle">
            No orders in your shop yet.{" "}
            <Link className="text-ui-fg-interactive hover:underline" href="/products">
              Choose products for your shop
            </Link>
          </p>
        </section>
      ) : (
        <>
          <ul className="flex flex-col gap-3 sm:hidden" aria-label="Sales">
            {orders.map((order) => (
              <li key={order.id} className="card flex flex-col gap-1 p-4 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">#{order.display_id}</span>
                  <span className="text-ui-fg-subtle">{day(order.created_at)}</span>
                </div>
                <p>{order.items.map((item) => `${item.quantity} × ${item.title}`).join(", ")}</p>
                <div className="flex items-baseline justify-between gap-2">
                  <span>{saleStatusLabel(order)}</span>
                  <span className="font-medium">{money(saleAmount(order), order.currency_code)}</span>
                </div>
                {refundedText(order) && <p className="text-ui-fg-subtle">{refundedText(order)}</p>}
                <p className="text-ui-fg-subtle">Your commission: {commissionText(order)}</p>
              </li>
            ))}
          </ul>
          <section className="card hidden overflow-x-auto p-4 sm:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Items</th>
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
                    <td>{order.items.map((item) => `${item.quantity} × ${item.title}`).join(", ")}</td>
                    <td>{saleStatusLabel(order)}</td>
                    <td>
                      {money(saleAmount(order), order.currency_code)}
                      {refundedText(order) && (
                        <span className="block text-xs text-ui-fg-subtle">{refundedText(order)}</span>
                      )}
                    </td>
                    <td>{commissionText(order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      <Pager path="/sales" page={page} count={count} limit={LIMIT} />
    </Shell>
  )
}
