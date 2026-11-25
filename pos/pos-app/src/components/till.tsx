"use client"

import { useCallback, useEffect, useState } from "react"
import { logout } from "@/app/login/actions"
import { api, type Register, type Shift } from "@/lib/api"
import { CloseShift } from "./close-shift"
import { RegisterPicker } from "./register-picker"
import { Sell } from "./sell"

// The till's screens (TASKS P2-10): pick a register → open (or continue) its
// shift → sell → close the shift. Everything goes through /api/pos (P2-06).

type Cashier = { id: string; name: string; email: string }
type Screen = { name: "registers" } | { name: "sell"; register: Register; shift: Shift } | { name: "close"; register: Register; shift: Shift }

const REGISTER_KEY = "pos.register"

export function Till({ cashier }: { cashier: Cashier }) {
  const [registers, setRegisters] = useState<Register[] | null>(null)
  const [currency, setCurrency] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>({ name: "registers" })

  const load = useCallback(async () => {
    setError(null)
    try {
      const { registers, currency_code } = await api<{ registers: Register[]; currency_code?: string | null }>(
        "registers"
      )
      setRegisters(registers)
      setCurrency(currency_code ?? null)
      return registers
    } catch (e) {
      setError((e as Error).message)
      return null
    }
  }, [])

  // Back to the same register's open shift after a reload or a crash.
  useEffect(() => {
    load().then((list) => {
      let saved: string | null = null
      try {
        saved = window.localStorage.getItem(REGISTER_KEY)
      } catch {
        // Private mode: no memory of the register, the picker is shown.
      }
      const register = list?.find((r) => r.id === saved && r.open_shift)
      if (register?.open_shift) {
        setScreen({ name: "sell", register, shift: register.open_shift })
      }
    })
  }, [load])

  const startSelling = (register: Register, shift: Shift) => {
    try {
      window.localStorage.setItem(REGISTER_KEY, register.id)
    } catch {
      // ignore
    }
    setScreen({ name: "sell", register, shift })
  }

  const backToRegisters = async () => {
    setScreen({ name: "registers" })
    await load()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print flex items-center justify-between gap-3 border-b border-ui-border-base bg-ui-bg-base px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {screen.name === "registers" ? "Choose a register" : screen.register.name}
          </div>
          <div className="truncate text-sm text-ui-fg-subtle">
            {cashier.name}
            {screen.name !== "registers" &&
              ` · shift since ${new Date(screen.shift.opened_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {screen.name === "sell" && (
            <>
              <button className="btn-secondary" onClick={backToRegisters}>
                Registers
              </button>
              <button className="btn-secondary" onClick={() => setScreen({ ...screen, name: "close" })}>
                Close shift
              </button>
            </>
          )}
          <form
            action={logout}
            onSubmit={(e) => {
              // Signing out leaves the shift open for the next cashier; say so.
              if (
                screen.name !== "registers" &&
                !window.confirm("Shift still open. Sign out anyway? The shift stays open until someone closes it.")
              ) {
                e.preventDefault()
              }
            }}
          >
            <button className="btn-secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 p-4">
        {error && (
          <div role="alert" className="card mb-4 flex items-center justify-between gap-3 p-4 text-ui-fg-error">
            <span>{error}</span>
            <button className="btn-secondary" onClick={load}>
              Retry
            </button>
          </div>
        )}
        {screen.name === "registers" && (
          <RegisterPicker
            registers={registers}
            cashierId={cashier.id}
            currency={currency}
            onSelect={startSelling}
            onCloseShift={(register, shift) => setScreen({ name: "close", register, shift })}
            onReload={load}
          />
        )}
        {/* Kept mounted (hidden) under Close shift, so "Back to selling" returns
            to the same sale instead of an empty cart. */}
        {(screen.name === "sell" || screen.name === "close") && (
          <div hidden={screen.name !== "sell"}>
            <Sell
              key={screen.shift.id}
              register={screen.register}
              shift={screen.shift}
              active={screen.name === "sell"}
            />
          </div>
        )}
        {screen.name === "close" && (
          <CloseShift
            shift={screen.shift}
            onCancel={() => setScreen({ ...screen, name: "sell" })}
            onDone={backToRegisters}
          />
        )}
      </main>
    </div>
  )
}
