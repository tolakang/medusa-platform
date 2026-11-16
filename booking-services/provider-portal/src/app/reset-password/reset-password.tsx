"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useActionState } from "react"
import { resetPassword, type AuthState } from "../login/actions"

export default function ResetPassword() {
  const params = useSearchParams()
  const [state, action, saving] = useActionState<AuthState, FormData>(resetPassword, {})

  if (state.info) {
    return (
      <>
        <p className="mt-4 rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">{state.info}</p>
        <Link className="btn-primary mt-6 w-full" href="/login">
          Sign in
        </Link>
      </>
    )
  }
  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="token" value={params.get("token") ?? ""} />
      <input type="hidden" name="email" value={params.get("email") ?? ""} />
      <p className="text-sm text-ui-fg-subtle">For {params.get("email") ?? "your account"}.</p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">New password</span>
        <input className="field" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Repeat password</span>
        <input className="field" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      {state.error && (
        <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
          {state.error}
        </p>
      )}
      <button className="btn-primary mt-2" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save password"}
      </button>
    </form>
  )
}
