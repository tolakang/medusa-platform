"use client"

import { useActionState } from "react"
import { saveSettings, type SettingsState } from "./actions"

type Details = {
  description?: string | null
  phone?: string | null
  telegram?: string | null
  payout_account?: string | null
}

export function SettingsForm({
  name,
  logo,
  handle,
  details = {},
}: {
  name: string
  logo: string | null
  handle: string
  details?: Details
}) {
  const [state, action, saving] = useActionState<SettingsState, FormData>(saveSettings, {})
  return (
    <form action={action} className="card flex max-w-lg flex-col gap-3 p-4">
      <h2 className="font-semibold">Shop settings</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Shop name</span>
        <input className="field" name="name" required maxLength={120} defaultValue={name} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Logo link (optional)</span>
        <input className="field" name="logo" type="url" placeholder="https://…" maxLength={500} defaultValue={logo ?? ""} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">About the shop (optional)</span>
        <textarea className="field" name="description" rows={3} maxLength={2000} defaultValue={details.description ?? ""} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Phone</span>
          <input className="field w-44" name="phone" type="tel" autoComplete="tel" maxLength={30} defaultValue={details.phone ?? ""} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Telegram username</span>
          <input className="field w-44" name="telegram" placeholder="@yourshop" maxLength={64} defaultValue={details.telegram ?? ""} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Payout account</span>
        <input
          className="field"
          name="payout_account"
          placeholder="Bank or ABA account number and name"
          maxLength={300}
          defaultValue={details.payout_account ?? ""}
        />
        <span className="text-xs text-ui-fg-subtle">The marketplace pays your earnings into this account.</span>
      </label>
      <p className="text-sm text-ui-fg-subtle">Shop address: {handle} (it doesn't change, so your links keep working).</p>
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
      <button className="btn-primary self-start" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  )
}
