"use client"

import { useState } from "react"
import { api, ApiError, type Register, type Shift } from "@/lib/api"
import { formatMoney } from "@/lib/cart"

// Pick a register; continue its open shift or open one with the cash in the
// drawer (open-pos-shift, P2-04: one open shift per register).

export function RegisterPicker({
  registers,
  cashierId,
  currency,
  onSelect,
  onCloseShift,
  onReload,
}: {
  registers: Register[] | null
  cashierId: string
  /** The currency a new shift opens in (the store default), for the cash field. */
  currency: string | null
  onSelect: (register: Register, shift: Shift) => void
  /** Close a shift someone else left open before starting your own. */
  onCloseShift: (register: Register, shift: Shift) => void
  onReload: () => Promise<unknown>
}) {
  const [opening, setOpening] = useState<Register | null>(null)
  const [cash, setCash] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A shift another cashier opened: confirm the handover before selling on it.
  const [handover, setHandover] = useState<string | null>(null)

  if (!registers) {
    return <p className="text-ui-fg-subtle">Loading registers…</p>
  }
  if (!registers.length) {
    return (
      <div className="card p-6">
        <p>No active registers. An admin sets them up in the shop admin (POS registers).</p>
      </div>
    )
  }

  const open = async () => {
    if (!opening) return
    setBusy(true)
    setError(null)
    try {
      const { shift } = await api<{ shift: Shift }>("shifts/open", {
        method: "POST",
        body: { register_id: opening.id, opening_cash: Number(cash) },
      })
      onSelect(opening, shift)
    } catch (e) {
      setError((e as Error).message)
      // Someone else opened it meanwhile: refresh so "Continue" shows.
      if (e instanceof ApiError && e.status === 400) {
        await onReload()
      }
    } finally {
      setBusy(false)
    }
  }

  const amount = Number(cash)
  const validCash = cash.trim() !== "" && Number.isFinite(amount) && amount >= 0

  return (
    <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
      {registers.map((r) => (
        <div key={r.id} className="card flex flex-col gap-3 p-4">
          <div>
            <div className="text-lg font-semibold">{r.name}</div>
            <div className="text-sm text-ui-fg-subtle">
              {r.code}
              {r.stock_location && ` · ${r.stock_location.name}`}
            </div>
          </div>
          {r.open_shift ? (
            <>
              <p className="text-sm">
                Shift opened by{" "}
                {r.open_shift.opened_by === cashierId ? "you" : (r.open_shift.opened_by_name ?? "another cashier")} at{" "}
                {new Date(r.open_shift.opened_at).toLocaleString()} with{" "}
                {formatMoney(r.open_shift.opening_cash, r.open_shift.currency_code)} in the drawer.
              </p>
              {handover === r.id ? (
                <div role="alertdialog" aria-label="Shift opened by someone else" className="flex flex-col gap-2">
                  <p className="rounded-lg bg-ui-bg-subtle p-3 text-sm">
                    {r.open_shift.opened_by_name ?? "Another cashier"} opened this shift. Continue selling on it, or
                    close it first (count the drawer) and open your own.
                  </p>
                  <div className="flex gap-2">
                    <button className="btn-secondary flex-1" onClick={() => onCloseShift(r, r.open_shift!)}>
                      Close it first
                    </button>
                    <button className="btn-primary flex-1" onClick={() => onSelect(r, r.open_shift!)} autoFocus>
                      Continue shift
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() =>
                    r.open_shift!.opened_by === cashierId ? onSelect(r, r.open_shift!) : setHandover(r.id)
                  }
                >
                  Continue shift
                </button>
              )}
            </>
          ) : opening?.id === r.id ? (
            // A form, so Enter opens the shift and Esc cancels (keyboard at the till).
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (validCash && !busy) open()
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !busy) setOpening(null)
              }}
            >
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Cash in the drawer now</span>
                <span className="relative flex items-center">
                  {currency && (
                    <span aria-hidden className="pointer-events-none absolute left-3 text-ui-fg-subtle">
                      {currencySymbol(currency)}
                    </span>
                  )}
                  <input
                  className={`field w-full ${currency ? "pl-10" : ""}`}
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step="0.01"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  autoFocus
                />
                </span>
              </label>
              {error && <p className="text-sm text-ui-fg-error">{error}</p>}
              <div className="flex gap-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setOpening(null)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={!validCash || busy}>
                  {busy ? "Opening…" : "Open shift"}
                </button>
              </div>
            </form>
          ) : (
            <button
              className="btn-secondary"
              onClick={() => {
                setOpening(r)
                setCash("")
                setError(null)
              }}
            >
              Open shift
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// "$" for USD, "៛" for KHR: the symbol Intl prints for the currency.
function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency.toUpperCase()
    )
  } catch {
    return currency.toUpperCase()
  }
}
