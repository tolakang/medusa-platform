"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { confirmEmail } from "../login/actions"

// Confirms the code once (the code works once; React may run effects twice
// in development).
export default function VerifyAccount() {
  const params = useSearchParams()
  const code = params.get("token")
  // Staff invited by the shop are approved already (backend adds invited=1).
  const invited = params.get("invited") === "1"
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
          ? invited
            ? "Your email is confirmed. Sign in to carry on."
            : "Your email is confirmed. Sign in to carry on; the shop reviews every new partner."
          : "This link is invalid or has expired. Sign in to get a new one."}
      </p>
      <Link href="/login" className="btn-primary mt-6 inline-block">
        Go to sign in
      </Link>
    </>
  )
}
