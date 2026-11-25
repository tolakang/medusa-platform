import Link from "next/link"
import { notFound } from "next/navigation"
import { Shell } from "@/components/shell"
import { day, money, toFulfil } from "@/lib/format"
import { requireVendor } from "@/lib/server/vendor"
import { backendFetch } from "@/lib/server/medusa"
import { FulfilButton } from "../fulfil-button"
import { OrderFacts, type VendorOrder } from "../page"

type Detail = VendorOrder & {
  fulfillments?: { id: string; created_at: string; canceled_at: string | null; items: { line_item_id: string; quantity: number }[] }[]
}

// One order (GET /vendors/me/orders/:id; gap review 2026-11-24): what to send,
// where, what's already sent, and what the vendor gets.
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token, vendor } = await requireVendor()
  if (vendor.status !== "active") {
    return <Shell vendor={vendor} active="/orders">{null}</Shell>
  }
  const result = await backendFetch<{ order: Detail }>(`/vendors/me/orders/${id}`, { token })
  if (!result.ok) notFound()
  const o = result.data.order
  const a = o.shipping_address
  const left = toFulfil(o.remaining)
  const title = (lineId: string) => o.items.find((i) => i.id === lineId)?.title ?? "Item"
  const sent = (o.fulfillments ?? []).filter((f) => !f.canceled_at)
  return (
    <Shell vendor={vendor} active="/orders">
      <Link href="/orders" className="text-sm text-ui-fg-interactive">
        ← All orders
      </Link>
      <section className="card flex flex-col gap-4 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Order #{o.display_id}</h2>
            <p className="text-ui-fg-subtle">
              {day(o.created_at)} · {o.status === "canceled" ? "Canceled" : left ? `${left} to fulfil` : "Fulfilled"}
            </p>
          </div>
          {o.status !== "canceled" && left > 0 && <FulfilButton orderId={o.id} />}
        </div>
        <OrderFacts o={o} />
        <div>
          <h3 className="mb-1 font-medium">Items</h3>
          <ul className="flex flex-col gap-1">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>
                  {i.quantity} × {i.title}
                  {i.variant_title && i.variant_title !== "Default" ? ` (${i.variant_title})` : ""}
                  {i.variant_sku ? <span className="text-ui-fg-subtle"> · {i.variant_sku}</span> : null}
                </span>
                <span className="text-ui-fg-subtle">{o.remaining[i.id] ? `${o.remaining[i.id]} to send` : "Sent"}</span>
              </li>
            ))}
          </ul>
        </div>
        {a && (
          <div>
            <h3 className="mb-1 font-medium">Deliver to</h3>
            <p>
              {[a.first_name, a.last_name].filter(Boolean).join(" ")}
              <br />
              {a.address_1}
              {a.address_2 ? `, ${a.address_2}` : ""}
              <br />
              {[a.city, a.province, a.postal_code].filter(Boolean).join(", ")}
              {a.phone && (
                <>
                  <br />
                  <a className="text-ui-fg-interactive" href={`tel:${a.phone}`}>
                    {a.phone}
                  </a>
                </>
              )}
            </p>
            <p className="mt-1 text-ui-fg-subtle">{o.shipping_methods.map((m) => m.name).join(", ")}</p>
          </div>
        )}
        <div>
          <h3 className="mb-1 font-medium">Sent</h3>
          {sent.length ? (
            <ul className="flex flex-col gap-1">
              {sent.map((f) => (
                <li key={f.id}>
                  {day(f.created_at)}: {f.items.map((it) => `${it.quantity} × ${title(it.line_item_id)}`).join(", ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ui-fg-subtle">Nothing sent yet.</p>
          )}
        </div>
        <p className="border-t border-ui-border-base pt-3">
          Total {money(o.total, o.currency_code)}
          {o.commission &&
            ` · commission ${money(o.commission.amount, o.currency_code)} (${o.commission.rate}%) · you get ${money(
              o.commission.payout_amount,
              o.currency_code
            )}`}
        </p>
      </section>
    </Shell>
  )
}
