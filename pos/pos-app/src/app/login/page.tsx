"use client"

import { useActionState, useEffect, useState } from "react"
import { login, setupAccount, type AuthState } from "./actions"

// Cashier sign-in (TASKS P2-10). First time: the admin has invited the email
// (Admin → POST /admin/pos/cashiers); the cashier sets a password here once.

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "setup">("login")
  // Controlled: React resets an uncontrolled form after each action, which
  // emptied the email after a wrong password.
  const [email, setEmail] = useState("")
  // Also controlled, so a wrong invite code doesn't wipe the passwords.
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [code, setCode] = useState("")
  // Set when the till sent a deactivated cashier back here (api.ts, page.tsx).
  const [inactive, setInactive] = useState(false)
  useEffect(() => {
    setInactive(new URLSearchParams(window.location.search).get("reason") === "inactive")
  }, [])
  const [loginState, loginAction, loggingIn] = useActionState<AuthState, FormData>(login, {})
  const [setupState, setupAction, settingUp] = useActionState<AuthState, FormData>(setupAccount, {})
  const state = mode === "login" ? loginState : setupState

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-2xl font-semibold">POS counter</h1>
        <p className="mt-1 text-ui-fg-subtle">
          {mode === "login" ? "Sign in to open the till." : "First time here? Set a password with your invited email and invite code."}
        </p>

        {inactive && (
          <p role="alert" className="mt-4 rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
            Your account was deactivated. Ask the shop admin to turn it back on.
          </p>
        )}

        <form action={mode === "login" ? loginAction : setupAction} className="mt-6 flex flex-col gap-3">
          <label htmlFor="login-email" className="flex flex-col gap-1">
            <span className="text-sm font-medium">Email</span>
            <input
              id="login-email"
              className="field"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label htmlFor="login-password" className="flex flex-col gap-1">
            <span className="text-sm font-medium">Password</span>
            <input
              id="login-password"
              className="field"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "setup" ? 8 : undefined}
              required
            />
          </label>
          {mode === "setup" && (
            <label htmlFor="login-confirm" className="flex flex-col gap-1">
              <span className="text-sm font-medium">Repeat password</span>
              <input
                id="login-confirm"
                className="field"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}
          {mode === "setup" && (
            <label htmlFor="login-invite" className="flex flex-col gap-1">
              <span className="text-sm font-medium">Invite code</span>
              <input
                id="login-invite"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="field uppercase"
                name="invite_code"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="XXXXX-XXXXX"
                maxLength={40}
                required
              />
            </label>
          )}

          {state.error && (
            <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
              {state.error}
            </p>
          )}
          {state.info && (
            <p className="rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">{state.info}</p>
          )}

          <button className="btn-primary mt-2" type="submit" disabled={loggingIn || settingUp}>
            {mode === "login" ? (loggingIn ? "Signing in…" : "Sign in") : settingUp ? "Setting up…" : "Set password and sign in"}
          </button>
        </form>

        {mode === "login" && (
          <a href="/forgot-password" className="mt-4 block py-2 text-center text-sm text-ui-fg-interactive">
            Forgot password?
          </a>
        )}
        <button
          type="button"
          className="mt-2 w-full py-2 text-center text-sm text-ui-fg-interactive"
          onClick={() => setMode(mode === "login" ? "setup" : "login")}
        >
          {mode === "login" ? "First time? Set your password" : "Back to sign in"}
        </button>
      </div>
    </main>
  )
}
