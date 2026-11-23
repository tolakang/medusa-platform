"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useActionState, useState } from "react"
import { resetPassword, type AuthState } from "../login/actions"

export default function ResetPassword() {
  const params = useSearchParams()
  const [state, action, saving] = useActionState<AuthState, FormData>(resetPassword, {})
  // The rule shown as you type (staging review, 2026-11-23).
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const longEnough = password.length >= 8
  const same = confirm.length > 0 && confirm === password

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
      <div className="flex flex-col gap-1">
        <label htmlFor="new-password" className="text-sm font-medium">
          New password
        </label>
        <div className="relative">
          <input
            id="new-password"
            className="field pr-16"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-rules"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs text-ui-fg-subtle hover:text-ui-fg-base"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Type it again</span>
        <input
          className="field"
          name="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <ul id="password-rules" className="flex flex-col gap-0.5 text-xs" aria-live="polite">
        <li className={longEnough ? "text-ui-tag-green-text" : "text-ui-fg-muted"}>
          <span aria-hidden className="inline-block w-4">{longEnough ? "✓" : "·"}</span>At least 8 characters (letters, numbers,
          anything)
        </li>
        <li className={same ? "text-ui-tag-green-text" : "text-ui-fg-muted"}>
          <span aria-hidden className="inline-block w-4">{same ? "✓" : "·"}</span>Both the same
        </li>
      </ul>
      {state.error && (
        <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
          {state.error}
        </p>
      )}
      <button className="btn-primary mt-2" type="submit" disabled={saving || !longEnough || !same}>
        {saving ? "Saving…" : "Save password"}
      </button>
    </form>
  )
}
