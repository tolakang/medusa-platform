"use client"

import { useActionState } from "react"
import { saveSettings, type SettingsState } from "./actions"

export function SettingsForm({ name, logo, handle }: { name: string; logo: string | null; handle: string }) {
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
