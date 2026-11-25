"use client"

import { useEffect, useRef, useState } from "react"
import { api, ApiError, type CheckoutPreview, type Customer, type LookupVariant, type PaymentMethod, type ReceiptOrder, type Register, type Shift } from "@/lib/api"
import {
  addLine,
  cartTotal,
  checkoutItems,
  formatMoney,
  itemCount,
  lineFromVariant,
  lineTotal,
  plural,
  saleMayBeRecorded,
  stockLeft,
  setQuantity,
  type CartLine,
} from "@/lib/cart"
import { clearSale as forgetSale, loadSale, saleIdentity, saveSale } from "@/lib/sale-store"
import { CustomerPicker } from "./customer-picker"
import { Payment } from "./payment"
import { Receipt } from "./receipt"
import { Scanner } from "./scanner"

// One sale at a time (TASKS P2-10): scan → cart → optional customer and promo
// code → price preview → payment → receipt. POST /pos/checkout/preview prices
// the sale as checkout will (promotions, tax) before payment opens; POST
// /pos/checkout (P2-05/P2-06) records the payment and links the order to the
// shift. After a checkout with no answer the sale may be recorded: the cart
// locks and keeps its ref until a retry succeeds, a check finds it not
// recorded, or the cashier clears it (owner, 2026-11-25).

type Done = { order: ReceiptOrder; method: PaymentMethod; tendered: number | null; customer: Customer | null }

export function Sell({
  register,
  shift,
  active = true,
}: {
  register: Register
  shift: Shift
  // False while the till shows another screen over the sale (Close shift):
  // the sale stays mounted so its cart survives, but takes no keys.
  active?: boolean
}) {
  const currency = shift.currency_code
  // The sale survives a reload (kept per shift in the browser), including the
  // unsure-sale lock and its client_ref, so a retry after a refresh can't
  // record the sale twice. Sell mounts only in the browser (Till).
  const [saved] = useState(() => loadSale(shift.id))
  const [cart, setCart] = useState<CartLine[]>(saved?.cart ?? [])
  const [customer, setCustomer] = useState<Customer | null>(saved?.customer ?? null)
  const [promo, setPromo] = useState(saved?.promo ?? "")
  const [choices, setChoices] = useState<LookupVariant[] | null>(null)
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null)
  // This sale's id (review 2, S7): new whenever the sale changes, the same
  // for every try of one sale. The sale can't change while `uncertain`.
  const identity = saleIdentity(cart, customer?.id ?? null, promo)
  const saleRef = useRef(
    saved ? { key: saleIdentity(saved.cart, saved.customer?.id ?? null, saved.promo), ref: saved.saleRef } : { key: "", ref: "" }
  )
  if (saleRef.current.key !== identity) {
    saleRef.current = { key: identity, ref: crypto.randomUUID() }
  }
  // The server's price for this cart, fetched when payment opens.
  const [preview, setPreview] = useState<CheckoutPreview | null>(saved?.preview ?? null)
  const [pricing, setPricing] = useState(false)
  // Set when a checkout got no answer: the sale may be recorded.
  const [uncertain, setUncertain] = useState<{ method: PaymentMethod; tendered: number | null } | null>(
    saved?.uncertain ?? null
  )
  const [checking, setChecking] = useState(false)
  const [looking, setLooking] = useState(false)
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  // The line a scan just added, flashed so the cashier sees it registered.
  const [flash, setFlash] = useState<string | null>(null)
  // A cleared sale, kept for 10 seconds so Clear can be undone.
  const [cleared, setCleared] = useState<{ cart: CartLine[]; customer: Customer | null; promo: string } | null>(null)

  useEffect(() => {
    if (done) {
      forgetSale(shift.id)
      return
    }
    saveSale(shift.id, { cart, customer, promo, saleRef: saleRef.current.ref, uncertain, preview })
  }, [shift.id, cart, customer, promo, uncertain, preview, done, identity])

  // Scan messages fade after a few seconds; the next action clears them too.
  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), message.tone === "error" ? 8000 : 5000)
    return () => window.clearTimeout(t)
  }, [message])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 1200)
    return () => window.clearTimeout(t)
  }, [flash])
  useEffect(() => {
    if (!cleared) return
    const t = window.setTimeout(() => setCleared(null), 10_000)
    return () => window.clearTimeout(t)
  }, [cleared])

  const add = (v: LookupVariant) => {
    const name = v.product.title ?? v.title ?? v.sku
    // Refuse at the scan what checkout would refuse at payment.
    const inCart = cart.find((l) => l.variant_id === v.id)?.quantity ?? 0
    if (v.stock != null && inCart + 1 > v.stock) {
      setChoices(null)
      setMessage({
        tone: "error",
        text: v.stock === 0 ? `${name} is out of stock here.` : `Only ${v.stock} × ${name} in stock here.`,
      })
      return
    }
    setCart((c) => addLine(c, lineFromVariant(v)))
    setChoices(null)
    setCleared(null)
    setFlash(v.id)
    setMessage({ tone: "info", text: `✓ Added ${name}` })
  }

  const lookup = async (code: string) => {
    if (uncertain) {
      setMessage({ tone: "error", text: "Finish this sale first: retry it, or check it and start a new one." })
      return
    }
    setLooking(true)
    setMessage(null)
    try {
      const { variants } = await api<{ variants: LookupVariant[] }>("products/lookup", {
        query: { code, shift_id: shift.id },
      })
      if (variants.length === 1) {
        add(variants[0])
      } else {
        setChoices(variants)
      }
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message })
    } finally {
      setLooking(false)
    }
  }

  const pay = async (method: PaymentMethod, tendered: number | null) => {
    const body: Record<string, unknown> = {
      shift_id: shift.id,
      items: checkoutItems(cart),
      payment_method: method,
      // Same id when "Complete sale" is pressed again after a lost answer, so
      // the backend doesn't record the sale twice (review 2, S7).
      client_ref: saleRef.current.ref,
    }
    if (customer) body.customer_id = customer.id
    if (promo.trim()) body.promo_codes = [promo.trim()]
    try {
      const { order } = await api<{ order: ReceiptOrder }>("checkout", { method: "POST", body })
      setDone({ order, method, tendered, customer })
      setPaying(false)
      setUncertain(null)
    } catch (e) {
      if (e instanceof ApiError && saleMayBeRecorded(e.status)) {
        setUncertain({ method, tendered })
        throw new ApiError(
          `${e.message} The sale may already be recorded: press Complete sale again to retry it (it won't be recorded twice).`,
          e.status
        )
      }
      throw e
    }
  }

  // Payment opens on the server's total, never the scan estimate.
  const openPayment = async () => {
    if (pricing) return
    setPricing(true)
    setMessage(null)
    try {
      const body: Record<string, unknown> = { shift_id: shift.id, items: checkoutItems(cart) }
      if (customer) body.customer_id = customer.id
      if (promo.trim()) body.promo_codes = [promo.trim()]
      const { preview } = await api<{ preview: CheckoutPreview }>("checkout/preview", { method: "POST", body })
      setPreview(preview)
      setPaying(true)
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message })
    } finally {
      setPricing(false)
    }
  }

  // After no answer: was the sale recorded? Yes → its receipt. No → the cart
  // unlocks with a new ref, so an edited sale is a new sale.
  const checkSale = async () => {
    if (!uncertain || checking) return
    setChecking(true)
    setMessage(null)
    try {
      const { order } = await api<{ order: ReceiptOrder }>("checkout", {
        query: { shift_id: shift.id, client_ref: saleRef.current.ref },
      })
      setDone({ order, method: uncertain.method, tendered: uncertain.tendered, customer })
      setUncertain(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        saleRef.current = { key: identity, ref: crypto.randomUUID() }
        setUncertain(null)
        setMessage({ tone: "info", text: "The sale was not recorded. Edit the cart if needed and press Pay again." })
      } else {
        setMessage({ tone: "error", text: (e as Error).message })
      }
    } finally {
      setChecking(false)
    }
  }

  const clearSale = () => {
    setCleared({ cart, customer, promo })
    setCart([])
    setCustomer(null)
    setPromo("")
    setMessage(null)
    setUncertain(null)
  }

  const undoClear = () => {
    if (!cleared) return
    setCart(cleared.cart)
    setCustomer(cleared.customer)
    setPromo(cleared.promo)
    setCleared(null)
  }

  const total = cartTotal(cart)
  const unpriced = cart.some((l) => l.unit_price === null)
  const canPay = cart.length > 0 && !unpriced && !uncertain && !pricing

  // F9 opens payment from anywhere on the sale screen (design critique, 2026-11-23).
  useEffect(() => {
    if (done || paying || !active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9" && canPay) {
        e.preventDefault()
        openPayment()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [done, paying, canPay, active, cart, customer, promo])

  const newSale = () => {
    setCart([])
    setCustomer(null)
    setPromo("")
    setDone(null)
    setMessage(null)
    setPreview(null)
  }

  if (done) {
    return (
      <Receipt
        register={register}
        order={done.order}
        method={done.method}
        tendered={done.tendered}
        customer={done.customer}
        onNext={newSale}
      />
    )
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_380px]">
      <section className="flex flex-col gap-3">
        <Scanner onCode={lookup} busy={looking} />
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={message.tone === "error" ? "text-ui-fg-error" : "text-ui-fg-subtle"}
          >
            {message.text}
          </p>
        )}
        {choices && (
          <div className="card p-3">
            <p className="mb-2 font-medium">Several products match. Pick one:</p>
            <div className="flex flex-col gap-2">
              {choices.map((v) => (
                <button key={v.id} className="btn-secondary justify-between" onClick={() => add(v)}>
                  <span>
                    {v.product.title} {v.title && `· ${v.title}`}
                  </span>
                  <span>{formatMoney(v.price, currency)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <fieldset disabled={!!uncertain} className="card divide-y divide-ui-border-base">
          {!cart.length && !cleared && <p className="p-6 text-center text-ui-fg-subtle">Scan an item to start the sale.</p>}
          {!cart.length && cleared && (
            <div role="status" className="flex items-center justify-between gap-3 p-4">
              <span>Sale cleared.</span>
              <button className="btn-secondary" onClick={undoClear}>
                Undo
              </button>
            </div>
          )}
          {cart.map((l) => (
            <div
              key={l.variant_id}
              className={`flex items-center gap-3 p-3 transition-colors ${flash === l.variant_id ? "bg-ui-tag-green-bg" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.title}</div>
                <div className="truncate text-sm text-ui-fg-subtle">
                  {[l.variant_title, l.sku].filter(Boolean).join(" · ")} · {formatMoney(l.unit_price, currency)}
                </div>
                {stockLeft(l) !== null && (
                  <div className={`text-xs ${stockLeft(l)! <= 0 ? "text-ui-fg-error" : "text-ui-fg-muted"}`}>
                    {stockLeft(l)! <= 0 ? "None left in stock" : `${stockLeft(l)} left in stock`}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="btn-secondary h-11 w-11 p-0"
                  aria-label={`One less ${l.title}`}
                  onClick={() => {
                    setMessage(null)
                    setCart((c) => setQuantity(c, l.variant_id, l.quantity - 1))
                  }}
                >
                  −
                </button>
                <span className="w-10 text-center text-lg tabular-nums">{l.quantity}</span>
                <button
                  className="btn-secondary h-11 w-11 p-0"
                  aria-label={`One more ${l.title}`}
                  onClick={() => {
                    setMessage(null)
                    setCart((c) => setQuantity(c, l.variant_id, l.quantity + 1))
                  }}
                >
                  +
                </button>
              </div>
              <div className="w-24 text-right tabular-nums">{formatMoney(lineTotal(l), currency)}</div>
              <button
                className="min-h-11 px-2 text-sm text-ui-fg-error"
                aria-label={`Remove ${l.title}`}
                onClick={() => {
                  setMessage(null)
                  setCart((c) => setQuantity(c, l.variant_id, 0))
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </fieldset>
      </section>

      <aside className="flex flex-col gap-3">
        <fieldset disabled={!!uncertain} className="flex flex-col gap-3">
        <CustomerPicker customer={customer} onChange={setCustomer} />
        <div className="card p-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Promotion code</span>
            <input
              className="field"
              value={promo}
              onChange={(e) => setPromo(e.target.value.toUpperCase())}
              placeholder="Optional"
              autoComplete="off"
            />
          </label>
        </div>
        </fieldset>
        <div className="card flex flex-col gap-3 p-4">
          {/* One total: the estimate before Pay, the server's price after. */}
          <div className="flex items-baseline justify-between">
            <span className="text-ui-fg-subtle">
              {plural(itemCount(cart), "item")}
              {paying && preview && " · To pay"}
            </span>
            <span className="text-3xl font-semibold tabular-nums">
              {formatMoney(paying && preview ? preview.total : total, currency)}
            </span>
          </div>
          {!(paying && preview) && (
            <p className="text-xs text-ui-fg-subtle">Estimate before promotions and tax; Pay shows the final total.</p>
          )}
          {unpriced && <p className="text-sm text-ui-fg-error">Some items have no price in {currency.toUpperCase()}.</p>}
          {paying && preview ? (
            <Payment
              preview={preview}
              currency={currency}
              initial={uncertain ?? undefined}
              onPay={pay}
              onCancel={() => setPaying(false)}
            />
          ) : uncertain ? (
            <div role="alert" className="flex flex-col gap-2">
              <p className="text-sm text-ui-fg-error">
                The last try got no answer, so this sale may already be recorded. The cart is locked until you retry
                it or check it.
              </p>
              <button className="btn-primary w-full" onClick={() => setPaying(true)} disabled={!preview || checking}>
                Retry sale
              </button>
              <button className="btn-secondary w-full" onClick={checkSale} disabled={checking}>
                {checking ? "Checking…" : "Check and start new"}
              </button>
              <button className="self-start py-2 text-sm text-ui-fg-error" onClick={clearSale} disabled={checking}>
                Abandon sale
              </button>
            </div>
          ) : (
            <>
              <button className="btn-primary w-full" onClick={openPayment} disabled={!canPay} aria-keyshortcuts="F9">
                {pricing ? "Pricing…" : "Pay"} <kbd className="ml-2 hidden text-xs opacity-70 lg:inline">F9</kbd>
              </button>
              <button className="self-start py-2 text-sm text-ui-fg-error" onClick={clearSale} disabled={!cart.length}>
                Clear sale
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
