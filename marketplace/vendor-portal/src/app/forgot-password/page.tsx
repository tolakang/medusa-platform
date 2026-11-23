"use client"

import Link from "next/link"
import { useActionState } from "react"
import { forgotPassword, type ResetState } from "../reset-password/actions"

// Forgot password (design critique, 2026-11-23). Needs no session.
export default function ForgotPasswordPage() {
  const [state, action, sending] = useActionState<ResetState, FormData>(forgotPassword, {})
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-ui-fg-subtle">
          We email you a link to choose a new password. It works for 15 minutes. No email? Ask the marketplace
          for a reset link.
        </p>
        <form action={action} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Email</span>
            <input className="field" name="email" type="email" autoComplete="username" required autoFocus />
          </label>
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
          <button className="btn-primary mt-2" type="submit" disabled={sending}>
            {sending ? "Sending…" : "Email me a link"}
          </button>
        </form>
        <Link href="/login" className="mt-4 block text-center text-sm text-ui-fg-interactive">
          ← Back to sign in
        </Link>
      </div>
    </main>
  )
}
