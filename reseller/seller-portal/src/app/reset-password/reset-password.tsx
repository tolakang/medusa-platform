"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useActionState, useState } from "react"
import { resetPassword, type ResetState } from "./actions"

// The rule shown as you type, as the booking provider portal (design
// critique, 2026-11-23): at least 8 characters, both the same.
const MIN_PASSWORD = 8

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? "text-ui-tag-green-text" : "text-ui-fg-muted"}>
      <span aria-hidden className="inline-block w-4">{ok ? "✓" : "·"}</span>
      {children}
    </li>
  )
}

export default function ResetPassword() {
  const params = useSearchParams()
  const [state, action, saving] = useActionState<ResetState, FormData>(resetPassword, {})
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const longEnough = password.length >= MIN_PASSWORD
  const same = confirm.length > 0 && confirm === password

  if (state.info) {
    return (
      <>
        <p role="status" className="mt-4 rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">
          {state.info}
        </p>
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
            minLength={MIN_PASSWORD}
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-rules"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-2 my-auto h-8 rounded px-2 text-xs text-ui-fg-subtle hover:text-ui-fg-base"
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
          minLength={MIN_PASSWORD}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <ul id="password-rules" className="flex flex-col gap-0.5 text-xs" aria-live="polite">
        <Rule ok={longEnough}>At least {MIN_PASSWORD} characters (letters, numbers, anything)</Rule>
        <Rule ok={same}>Both the same</Rule>
      </ul>
      {state.error && (
        <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
          {state.error}{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Get a new link
          </Link>
        </p>
      )}
      <button className="btn-primary mt-2" type="submit" disabled={saving || !longEnough || !same}>
        {saving ? "Saving…" : "Save password"}
      </button>
    </form>
  )
}
