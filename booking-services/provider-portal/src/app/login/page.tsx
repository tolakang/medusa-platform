"use client"

import { useActionState, useState } from "react"
import { acceptInvite, forgotPassword, login, signUp, type AuthState } from "./actions"

// Sign-in for both roles (TASKS P3-32): staff set their password with the
// invite code the shop gave them; partners sign up on their own and wait for
// the shop's approval. Staging review (2026-11-23): the three ways in are tabs
// instead of a stack of links, a new password shows its rule (at least 8
// characters, both the same) as you type, passwords can be shown, and a wrong
// password leads straight to the reset.

type Mode = "login" | "invite" | "signup" | "forgot"

const TABS: { mode: Mode; label: string }[] = [
  { mode: "login", label: "Sign in" },
  { mode: "invite", label: "I have an invite code" },
  { mode: "signup", label: "New partner" },
]

const INTRO: Record<Mode, string> = {
  login: "Your calendar, bookings and earnings.",
  invite: "The shop gave you a code. Use the email they invited, then choose your password.",
  signup: "Offer your services through the shop. We review every new partner before you appear.",
  forgot: "We email you a link to choose a new password. It works for 15 minutes.",
}
const SUBMIT: Record<Mode, [string, string]> = {
  login: ["Sign in", "Signing in…"],
  invite: ["Set my password", "Setting your password…"],
  signup: ["Create my account", "Creating your account…"],
  forgot: ["Email me a link", "Sending…"],
}
const MIN_PASSWORD = 8

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? "text-ui-tag-green-text" : "text-ui-fg-muted"}>
      <span aria-hidden className="inline-block w-4">{ok ? "✓" : "·"}</span>
      {children}
    </li>
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login")
  // Controlled, so a wrong password or a change of tab doesn't empty them.
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [loginState, loginAction, loggingIn] = useActionState<AuthState, FormData>(login, {})
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, {})
  const [inviteState, inviteAction, accepting] = useActionState<AuthState, FormData>(acceptInvite, {})
  const [forgotState, forgotAction, sending] = useActionState<AuthState, FormData>(forgotPassword, {})
  const forms = {
    login: { state: loginState, action: loginAction },
    signup: { state: signUpState, action: signUpAction },
    invite: { state: inviteState, action: inviteAction },
    forgot: { state: forgotState, action: forgotAction },
  }
  const { state, action } = forms[mode]
  const busy = loggingIn || signingUp || accepting || sending
  const newPassword = mode === "signup" || mode === "invite"
  const longEnough = password.length >= MIN_PASSWORD
  const same = confirm.length > 0 && confirm === password
  const ready = !newPassword || (longEnough && same)
  const wrongPassword = mode === "login" && state.error === "Wrong email or password."
  const go = (next: Mode) => {
    setMode(next)
    setPassword("")
    setConfirm("")
  }

  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-md">
        <p className="text-sm font-medium uppercase tracking-wide text-ui-fg-muted">Provider portal</p>
        <h1 className="mt-1 text-2xl font-semibold">{mode === "forgot" ? "Reset your password" : "Welcome"}</h1>
        <p className="mt-1 text-ui-fg-subtle">{INTRO[mode]}</p>

        {mode !== "forgot" && (
          <div role="tablist" aria-label="How do you want to get in?" className="mt-6 grid grid-cols-3 rounded-lg border border-ui-border-base bg-ui-bg-base p-1 text-sm">
            {TABS.map((t) => (
              <button
                key={t.mode}
                type="button"
                role="tab"
                aria-selected={mode === t.mode}
                onClick={() => go(t.mode)}
                className={
                  mode === t.mode
                    ? "rounded-md bg-ui-bg-subtle px-2 py-2 font-medium text-ui-fg-base"
                    : "rounded-md px-2 py-2 text-ui-fg-subtle hover:text-ui-fg-base"
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <form action={action} className="card mt-4 flex flex-col gap-4 p-5" key={mode}>
          {mode === "signup" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Your name</span>
                <input className="field" name="name" aria-label="Your name" required maxLength={120} autoComplete="name" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  Area you serve <span className="font-normal text-ui-fg-muted">(optional)</span>
                </span>
                <input className="field" name="area" aria-label="Area you serve (optional)" maxLength={200} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Email</span>
            <input
              className="field"
              name="email"
              aria-label="Email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {mode === "invite" && <span className="text-xs text-ui-fg-muted">The one the shop invited.</span>}
          </label>
          {mode === "invite" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Invite code</span>
              <input
                className="field font-mono uppercase tracking-wider"
                name="invite_code"
                aria-label="Invite code"
                required
                maxLength={40}
                autoComplete="off"
                placeholder="e.g. 6XUKD-AKHE7"
              />
            </label>
          )}
          {mode !== "forgot" && (
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  {newPassword ? "Choose a password" : "Password"}
                </label>
                {mode === "login" && (
                  <button type="button" className="text-xs text-ui-fg-interactive" onClick={() => go("forgot")}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  className="field pr-16"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={newPassword ? "new-password" : "current-password"}
                  minLength={newPassword ? MIN_PASSWORD : undefined}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={newPassword ? "password-rules" : undefined}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs text-ui-fg-subtle hover:text-ui-fg-base"
                  onClick={() => setShow((s) => !s)}
                  aria-pressed={show}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}
          {newPassword && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Type it again</span>
                <input
                  className="field"
                  name="confirm"
                  aria-label="Type the password again"
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
            </>
          )}

          {state.error && (
            <div role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
              {state.error}
              {wrongPassword && (
                <>
                  {" "}
                  <button type="button" className="font-medium underline" onClick={() => go("forgot")}>
                    Reset your password
                  </button>
                  , or ask the shop for a reset link.
                </>
              )}
            </div>
          )}
          {state.info && <p className="rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">{state.info}</p>}

          <button className="btn-primary" type="submit" disabled={busy || !ready}>
            {SUBMIT[mode][busy ? 1 : 0]}
          </button>
        </form>

        {mode === "forgot" && (
          <button type="button" className="mt-4 text-sm text-ui-fg-interactive" onClick={() => go("login")}>
            ← Back to sign in
          </button>
        )}
      </div>
    </main>
  )
}
