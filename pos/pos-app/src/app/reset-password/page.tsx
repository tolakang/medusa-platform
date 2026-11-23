import { Suspense } from "react"
import ResetPassword from "./reset-password"

// The link in the "set a new password" email, or the one the admin copied
// (design critique, 2026-11-23). Needs no session.
export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <p className="text-sm text-ui-fg-muted">POS counter</p>
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <Suspense fallback={null}>
          <ResetPassword />
        </Suspense>
      </div>
    </main>
  )
}
