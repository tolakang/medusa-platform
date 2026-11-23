"use client"

import { useEffect, useState } from "react"
import type { PaymentMethod } from "@/lib/api"
import { changeDue, formatMoney, quickTender } from "@/lib/cart"

// Payment (TASKS P2-10). Cash: enter what the customer gave, see the change.
// Card and QR: the money is taken on the shop's terminal or KHQR stand first;
// the sale only records it (TASKS F-038). Promotions can lower the final
// total, so cash change is shown again on the receipt from the real total.

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "qr", label: "QR (KHQR)" },
]

export function Payment({
  total,
  currency,
  onPay,
  onCancel,
}: {
  total: number
  currency: string
  onPay: (method: PaymentMethod, tendered: number | null) => Promise<void>
  onCancel: () => void
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [tendered, setTendered] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cash = Number(tendered)
  const change = method === "cash" && tendered !== "" ? changeDue(total, cash) : null
  const ready = method !== "cash" || change !== null

  // Keyboard paying (design critique, 2026-11-23): Esc goes back; F1–F3 pick
  // the method. Enter in the form completes the sale.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return
      if (e.key === "Escape") {
        e.preventDefault()
        onCancel()
      }
      const i = ["F1", "F2", "F3"].indexOf(e.key)
      if (i >= 0) {
        e.preventDefault()
        setMethod(METHODS[i].id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onCancel])

  const confirm = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      await onPay(method, method === "cash" ? cash : null)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <form
      data-keep-focus
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        confirm()
      }}
    >
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
        {METHODS.map((m, i) => (
          <button
            key={m.id}
            type="button"
            aria-keyshortcuts={`F${i + 1}`}
            role="radio"
            aria-checked={method === m.id}
            className={method === m.id ? "btn-primary" : "btn-secondary"}
            onClick={() => setMethod(m.id)}
            disabled={busy}
          >
            {m.label}
            <kbd className="ml-1 hidden text-xs opacity-60 lg:inline">F{i + 1}</kbd>
          </button>
        ))}
      </div>

      {method === "cash" ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Cash received</span>
            <input
              className="field text-right text-xl tabular-nums"
              inputMode="decimal"
              type="number"
              min={0}
              step="0.01"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              aria-label="Cash received"
              autoFocus
            />
          </label>
          <div className="grid grid-cols-4 gap-2">
            {quickTender(total).map((a) => (
              <button key={a} type="button" className="btn-secondary px-2" onClick={() => setTendered(String(a))} disabled={busy}>
                {formatMoney(a, currency)}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-lg">
            <span>Change</span>
            <span className="font-semibold tabular-nums">{change === null ? "–" : formatMoney(change, currency)}</span>
          </div>
        </>
      ) : (
        <p className="rounded-lg bg-ui-bg-subtle p-3 text-sm">
          Take {formatMoney(total, currency)} on the {method === "card" ? "card terminal" : "KHQR stand"} first, then
          press Enter or Complete sale.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-ui-fg-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy} aria-keyshortcuts="Escape">
          Back <kbd className="ml-1 hidden text-xs opacity-60 lg:inline">Esc</kbd>
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={!ready || busy} aria-keyshortcuts="Enter">
          {busy ? "Recording sale…" : "Complete sale"}
          {!busy && <kbd className="ml-2 hidden text-xs opacity-70 lg:inline">Enter</kbd>}
        </button>
      </div>
    </form>
  )
}
