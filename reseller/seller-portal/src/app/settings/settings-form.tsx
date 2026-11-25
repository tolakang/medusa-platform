"use client"

import { useActionState } from "react"
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
}: {
  label: string
  name: string
  value?: string | null
  maxLength: number
  hint?: string
  type?: string
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {/* defaultValue + key: React resets a form after its action; the
          saved values come back from the server on revalidate. */}
      <input
        className="field"
        name={name}
        type={type}
        maxLength={maxLength}
        defaultValue={value ?? ""}
        autoComplete={autoComplete}
      />
      {hint && <span className="text-xs text-ui-fg-subtle">{hint}</span>}
    </label>
  )
}

export function SettingsForm({ seller }: { seller: Seller }) {
  const [state, action, saving] = useActionState<SettingsState, FormData>(saveSettings, {})
  return (
    <form action={action} className="card flex max-w-lg flex-col gap-3 p-4">
      <h2 className="font-semibold">Your shop</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Shop name</span>
        <input className="field" name="name" required maxLength={120} defaultValue={seller.name} />
      </label>
      <p className="text-sm text-ui-fg-subtle">
        Your web address: {seller.domain ?? "not set yet"}. Ask the shop owner to change it.
      </p>

      <h2 className="mt-2 font-semibold">Contact</h2>
      <Field label="Phone" name="phone" type="tel" autoComplete="tel" value={seller.phone} maxLength={40} />
      <Field label="Telegram" name="telegram" value={seller.telegram} maxLength={64} hint="Your username, such as @myshop." />

      <h2 className="mt-2 font-semibold">Where we pay you</h2>
      <Field label="Bank" name="payout_bank_name" value={seller.payout_bank_name} maxLength={80} hint="Such as ABA Bank." />
      <Field label="Account name" name="payout_account_name" value={seller.payout_account_name} maxLength={120} />
      <Field label="Account number" name="payout_account_number" value={seller.payout_account_number} maxLength={40} />

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
