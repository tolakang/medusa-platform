"use server"

import { redirect } from "next/navigation"
import { backendFetch, sdk } from "@/lib/server/medusa"
import { clearToken, setToken } from "@/lib/server/session"

// Provider sign-in, partner sign-up and staff invitations (TASKS P3-32) over
// the backend's provider flow (P3-31): register, then either POST /providers
// (a partner signs up and waits for the shop's approval) or POST
// /providers/accept (a staff member, with the invite code the shop gave
// them), then sign in. Both confirm their email first: the backend answers
// `verification_required`, the portal asks for the email (metadata actor
// "provider", so the link opens this portal's /verify-account) and says so.

export type AuthState = { error?: string; info?: string }

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim()

type SignIn = { token: string } | { verify: string } | null

async function signIn(email: string, password: string): Promise<SignIn> {
  try {
    const result = await sdk.auth.login("provider", "emailpass", { email, password })
    if (typeof result === "string") {
      return { token: result }
    }
    if (
      result &&
      typeof result === "object" &&
      "verification_required" in result &&
      result.verification_required &&
      typeof result.token === "string"
    ) {
      return { verify: result.token }
    }
    return null
  } catch {
    return null
  }
}

// Sends the "confirm your email" link (the backend allows one per address
// every 2 minutes).
async function askToVerify(email: string, token: string): Promise<AuthState> {
  try {
    await sdk.auth.verification.request(
      { entity_id: email, entity_type: "email", metadata: { actor: "provider" } },
      { authorization: `Bearer ${token}` }
    )
    return { info: `We emailed a link to ${email}. Open it to confirm your email, then sign in.` }
  } catch (e) {
    const status = (e as { status?: number })?.status
    return status === 429
      ? { info: `We already emailed a link to ${email}. Open it to confirm your email, then sign in.` }
      : { error: "Couldn't send the confirmation email. Try again in a few minutes." }
  }
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  // Emailpass matches the email exactly as registered (MEDUSA_SKILL §7), and
  // the forms below register it lowercased, so sign in lowercased too.
  const email = field(form, "email").toLowerCase()
  const password = String(form.get("password") ?? "")
  if (!email || !password) {
    return { error: "Enter your email and password." }
  }
  const signedIn = await signIn(email, password)
  if (!signedIn) {
    return { error: "Wrong email or password." }
  }
  if ("verify" in signedIn) {
    return askToVerify(email, signedIn.verify)
  }
  const me = await backendFetch<{ provider: { id: string } }>("/providers/me", { token: signedIn.token })
  if (!me.ok) {
    return {
      error:
        me.status === 401
          ? "This account isn't a provider yet, or it is suspended. Staff: use your invite code first. Otherwise contact the shop."
          : me.message,
    }
  }
  await setToken(signedIn.token)
  redirect("/")
}

// Sets the password for this email, or carries on with it when an earlier try
// stopped halfway. The registration token, or the error to show.
async function registration(email: string, password: string): Promise<{ token: string } | { error: string }> {
  try {
    return { token: await sdk.auth.register("provider", "emailpass", { email, password }) }
  } catch (e) {
    const message = e instanceof Error ? e.message : ""
    if (!/exist/i.test(message)) {
      return { error: message || "Couldn't create the account." }
    }
    const again = await signIn(email, password)
    if (!again) {
      return { error: "This email already has a password. Sign in instead, or reset your password." }
    }
    return { token: "token" in again ? again.token : again.verify }
  }
}

const newPassword = (form: FormData): string | { error: string } => {
  const password = String(form.get("password") ?? "")
  if (password.length < 8) {
    return { error: "Choose a password of at least 8 characters." }
  }
  if (password !== String(form.get("confirm") ?? "")) {
    return { error: "The two passwords don't match." }
  }
  return password
}

// After the provider exists: sign in, or ask to confirm the email first.
async function finish(email: string, password: string, fallbackToken: string): Promise<AuthState> {
  const signedIn = await signIn(email, password)
  if (signedIn && "token" in signedIn) {
    await setToken(signedIn.token)
    redirect("/")
  }
  return askToVerify(email, signedIn && "verify" in signedIn ? signedIn.verify : fallbackToken)
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email").toLowerCase()
  const name = field(form, "name")
  if (!name || !email) {
    return { error: "Enter your name and email." }
  }
  const password = newPassword(form)
  if (typeof password !== "string") {
    return password
  }
  const registered = await registration(email, password)
  if ("error" in registered) {
    return registered
  }
  const created = await backendFetch("/providers", {
    token: registered.token,
    method: "POST",
    body: { name, area: field(form, "area") || null, phone: field(form, "phone") || null },
  })
  if (!created.ok) {
    return { error: created.message }
  }
  return finish(email, password, registered.token)
}

export async function acceptInvite(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email").toLowerCase()
  const invite_code = field(form, "invite_code")
  if (!email || !invite_code) {
    return { error: "Enter your email and the invite code the shop gave you." }
  }
  const password = newPassword(form)
  if (typeof password !== "string") {
    return password
  }
  const registered = await registration(email, password)
  if ("error" in registered) {
    return registered
  }
  const accepted = await backendFetch("/providers/accept", {
    token: registered.token,
    method: "POST",
    body: { invite_code },
  })
  if (!accepted.ok) {
    return { error: accepted.message }
  }
  return finish(email, password, registered.token)
}

// The backend always answers the same, whether the email is known or not.
export async function forgotPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email").toLowerCase()
  if (!email) {
    return { error: "Enter your email." }
  }
  try {
    await sdk.auth.resetPassword("provider", "emailpass", { identifier: email })
  } catch (e) {
    if ((e as { status?: number })?.status === 429) {
      return { error: "Too many tries. Wait a few minutes and try again." }
    }
  }
  return { info: `If ${email} has an account, we emailed a link to set a new password. It works for 15 minutes.` }
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email")
  const token = field(form, "token")
  if (!email || !token) {
    return { error: "This link is invalid or has expired. Ask for a new one." }
  }
  const password = newPassword(form)
  if (typeof password !== "string") {
    return password
  }
  try {
    await sdk.auth.updateProvider("provider", "emailpass", { email, password }, token)
  } catch {
    return { error: "This link is invalid or has expired. Ask for a new one." }
  }
  return { info: "Your password is changed. Sign in with the new one." }
}

// The emailed link's code (POST /auth/verification/confirm needs no sign-in).
export async function confirmEmail(code: string): Promise<boolean> {
  try {
    await sdk.auth.verification.confirm({ code })
    return true
  } catch {
    return false
  }
}

export async function logout(): Promise<void> {
  await clearToken()
  redirect("/login")
}
