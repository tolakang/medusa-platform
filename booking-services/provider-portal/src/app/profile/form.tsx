"use client"

import { useActionState } from "react"
import { Notice } from "@/components/notice"
import type { Provider } from "@/lib/server/provider"
import { saveProfile, type FormState } from "./actions"

export function ProfileForm({ provider }: { provider: Provider }) {
  const [state, action, saving] = useActionState<FormState, FormData>(saveProfile, {})
  const text = (name: "name" | "phone" | "area" | "photo", label: string, max: number) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <input className="field" name={name} defaultValue={provider[name] ?? ""} maxLength={max} />
    </label>
  )
  return (
    <form action={action} className="flex flex-col gap-3">
      {text("name", "Name", 120)}
      {text("phone", "Phone (optional)", 20)}
      {text("area", "Area you serve (optional)", 200)}
      {text("photo", "Photo address (optional, https://…)", 2000)}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">About you (optional)</span>
        <textarea className="field" name="bio" rows={4} defaultValue={provider.bio ?? ""} maxLength={2000} />
      </label>
      <Notice state={state} />
      <button className="btn-primary self-start" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  )
}
