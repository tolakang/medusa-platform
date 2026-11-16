"use client"

import { useActionState, useState } from "react"
import { acceptInvite, forgotPassword, login, signUp, type AuthState } from "./actions"

// Sign-in for both roles (TASKS P3-32): staff set their password with the
// invite code the shop gave them; partners sign up on their own and wait for
// the shop's approval.

type Mode = "login" | "signup" | "invite" | "forgot"

const INTRO: Record<Mode, string> = {
  login: "Sign in to see your calendar and bookings.",
  signup: "Offer your services through the shop. We review every new partner.",
  invite: "First time? Set your password with the invite code the shop gave you.",
  forgot: "We email you a link to set a new password.",
}
const SUBMIT: Record<Mode, [string, string]> = {
  login: ["Sign in", "Signing in…"],
  signup: ["Sign up", "Signing up…"],
  invite: ["Set password", "Setting your password…"],
  forgot: ["Email me a link", "Sending…"],
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login")
  // Controlled, so a wrong password or a mode change doesn't empty it.
  const [email, setEmail] = useState("")
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

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-2xl font-semibold">Provider portal</h1>
        <p className="mt-1 text-ui-fg-subtle">{INTRO[mode]}</p>

        <form action={action} className="mt-6 flex flex-col gap-3">
          {mode === "signup" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Your name</span>
                <input className="field" name="name" required maxLength={120} autoComplete="name" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Area you serve (optional)</span>
                <input className="field" name="area" maxLength={200} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Email</span>
            <input
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
          {mode === "invite" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Invite code</span>
              <input className="field font-mono uppercase" name="invite_code" required maxLength={40} autoComplete="off" />
            </label>
          )}
          {mode !== "forgot" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">{newPassword ? "New password" : "Password"}</span>
              <input
                className="field"
                name="password"
                type="password"
                autoComplete={newPassword ? "new-password" : "current-password"}
                minLength={newPassword ? 8 : undefined}
                required
              />
            </label>
          )}
          {newPassword && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Repeat password</span>
              <input className="field" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
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

          <button className="btn-primary mt-2" type="submit" disabled={busy}>
            {SUBMIT[mode][busy ? 1 : 0]}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2 text-center text-sm text-ui-fg-interactive">
          {mode === "login" ? (
            <>
              <button type="button" onClick={() => setMode("invite")}>
                I have an invite code
              </button>
              <button type="button" onClick={() => setMode("signup")}>
                New partner? Sign up
              </button>
              <button type="button" onClick={() => setMode("forgot")}>
                Forgot password?
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setMode("login")}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
