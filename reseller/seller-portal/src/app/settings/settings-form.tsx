"use client"

import { useActionState, useState, type ChangeEvent } from "react"
import type { Seller } from "@/lib/server/seller"
import { changePassword, saveSettings, type SettingsState } from "./actions"

function Messages({ state }: { state: SettingsState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
          {state.error}
        </p>
      )}
      {state.info && (
        <p role="status" className="rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">
          {state.info}
        </p>
      )}
    </>
  )
}

function Field({
  label,
  name,
  value,
  maxLength,
  hint,
  type = "text",
  autoComplete,
  onChange,
}: {
  label: string
  name: string
  value?: string | null
  maxLength: number
  hint?: string
  type?: string
  autoComplete?: string
  // Given: a controlled input (keeps what was typed when a save fails).
  onChange?: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {/* React resets an uncontrolled form after its action, so fields that
          must survive a failed save are controlled (onChange given). The
          password fields stay uncontrolled: they clear after each try. */}
      <input
        className="field"
        name={name}
        type={type}
        maxLength={maxLength}
        {...(onChange
          ? { value: value ?? "", onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value) }
          : { defaultValue: value ?? "" })}
        autoComplete={autoComplete}
      />
      {hint && <span className="text-xs text-ui-fg-subtle">{hint}</span>}
    </label>
  )
}

export function SettingsForm({ seller }: { seller: Seller }) {
  const [state, action, saving] = useActionState<SettingsState, FormData>(saveSettings, {})
  // Controlled, so a failed save keeps what the seller typed (like the
  // products form); after a good save these already match the saved values.
  const [values, setValues] = useState({
    name: seller.name ?? "",
    phone: seller.phone ?? "",
    telegram: seller.telegram ?? "",
    payout_bank_name: seller.payout_bank_name ?? "",
    payout_account_name: seller.payout_account_name ?? "",
    payout_account_number: seller.payout_account_number ?? "",
  })
  const bind = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (v: string) => setValues((prev) => ({ ...prev, [key]: v })),
  })
  return (
    <form action={action} className="card flex max-w-lg flex-col gap-3 p-4">
      <h2 className="font-semibold">Your shop</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Shop name</span>
        <input className="field" name="name" required maxLength={120}
          value={values.name}
          onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
        />
      </label>
      <p className="text-sm text-ui-fg-subtle">
        Your web address: {seller.domain ?? "not set yet"}. Ask the shop owner to change it.
      </p>

      <h2 className="mt-2 font-semibold">Contact</h2>
      <Field label="Phone" name="phone" type="tel" autoComplete="tel" {...bind("phone")} maxLength={40} />
      <Field label="Telegram" name="telegram" {...bind("telegram")} maxLength={64} hint="Your username, such as @myshop." />

      <h2 className="mt-2 font-semibold">Where we pay you</h2>
      <Field label="Bank" name="payout_bank_name" {...bind("payout_bank_name")} maxLength={80} hint="Such as ABA Bank." />
      <Field label="Account name" name="payout_account_name" {...bind("payout_account_name")} maxLength={120} />
      <Field label="Account number" name="payout_account_number" {...bind("payout_account_number")} maxLength={40} />

      <Messages state={state} />
      <button className="btn-primary self-start" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  )
}

export function PasswordForm() {
  const [state, action, saving] = useActionState<SettingsState, FormData>(changePassword, {})
  return (
    <form action={action} className="card flex max-w-lg flex-col gap-3 p-4">
      <h2 className="font-semibold">Change password</h2>
      <Field label="Current password" name="current_password" type="password" autoComplete="current-password" maxLength={200} />
      <Field label="New password" name="new_password" type="password" autoComplete="new-password" maxLength={200} hint="At least 8 characters." />
      <Field label="Repeat new password" name="confirm" type="password" autoComplete="new-password" maxLength={200} />
      <Messages state={state} />
      <button className="btn-primary self-start" type="submit" disabled={saving}>
        {saving ? "Changing…" : "Change password"}
      </button>
    </form>
  )
}
