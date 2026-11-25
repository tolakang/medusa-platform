"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { confirmEmail } from "../login/actions"

// Confirms the code once (the code works once; React may run effects twice
// in development).
export default function VerifyAccount() {
  const code = useSearchParams().get("token")
  const [state, setState] = useState<"checking" | "done" | "failed">("checking")
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) {
      return
    }
    sent.current = true
    if (!code) {
      setState("failed")
      return
    }
    confirmEmail(code).then((ok) => setState(ok ? "done" : "failed"))
  }, [code])

  if (state === "checking") {
    return <p className="mt-4 text-ui-fg-subtle">Confirming your email…</p>
  }
  return (
    <>
      <p className="mt-4">
        {state === "done"
          ? "Your email is confirmed. Sign in to see your shop; the marketplace reviews every new shop."
          : // A link works once, so a second click lands here too (bug
            // 2026-11-25). Whether the email is confirmed isn't told to an
            // anonymous visitor (it would reveal accounts), so both cases are named.
            "This link was already used or has expired. If you already confirmed your email, just sign in. Otherwise sign in to get a new link."}
      </p>
      <Link href="/login" className="btn-primary mt-6 inline-block">
        Go to sign in
      </Link>
    </>
  )
}
