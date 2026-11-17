"use client"

import { requestQuote } from "@lib/data/booking"
import { HttpTypes } from "@medusajs/types"
import { Button } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useState } from "react"

// Quote first (TASKS P3-27): a quote-only service shows "Price on quote" and
// a request form. The shop answers with a price and a time, which the
// customer accepts in Account → Quotes and pays at checkout.
export default function QuoteRequest({ product, signedIn }: { product: HttpTypes.StoreProduct; signedIn: boolean }) {
  const variantId = product.variants?.[0]?.id ?? ""
  const [details, setDetails] = useState("")
  const [wished, setWished] = useState("")
  const [address, setAddress] = useState("")
  const [dropoff, setDropoff] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-y-3" data-testid="quote-sign-in">
        <p className="text-xl-semi">Price on quote</p>
        <p className="txt-medium text-ui-fg-subtle">Sign in to ask for a quote, so you can see and accept it.</p>
        <LocalizedClientLink href="/account" className="underline txt-medium">
          Sign in or create an account
        </LocalizedClientLink>
      </div>
    )
  }
  if (sent) {
    return (
      <div className="flex flex-col gap-y-2" data-testid="quote-sent">
        <p className="text-xl-semi">Request sent</p>
        <p className="txt-medium text-ui-fg-subtle">
          We&apos;ll email you a price and a time. You can accept it in{" "}
          <LocalizedClientLink href="/account/quotes" className="underline">
            your quotes
          </LocalizedClientLink>
          .
        </p>
      </div>
    )
  }
  const ok = details.trim().length >= 5 && wished && variantId
  const input = "w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 txt-medium"
  return (
    <form
      className="flex flex-col gap-y-3"
      data-testid="quote-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ok) return
        setPending(true)
        setError(null)
        const r = await requestQuote({
          variantId,
          details: details.trim(),
          wishedStartsAt: new Date(wished).toISOString(),
          address: address.trim() || undefined,
          dropoffAddress: dropoff.trim() || undefined,
        })
        setPending(false)
        if (r.error) setError(r.error)
        else setSent(true)
      }}
    >
      <p className="text-xl-semi">Price on quote</p>
      <label className="flex flex-col gap-y-1 txt-small">
        What do you need?
        <textarea className={input} rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Rooms, big items, stairs…" required />
      </label>
      <label className="flex flex-col gap-y-1 txt-small">
        When would you like it?
        <input className={input} type="datetime-local" value={wished} onChange={(e) => setWished(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-y-1 txt-small">
        From (address)
        <input className={input} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label className="flex flex-col gap-y-1 txt-small">
        To (address)
        <input className={input} value={dropoff} onChange={(e) => setDropoff(e.target.value)} />
      </label>
      {error && <p className="txt-small text-ui-fg-error">{error}</p>}
      <Button type="submit" variant="primary" className="w-full h-10" disabled={!ok} isLoading={pending} data-testid="quote-submit">
        Ask for a quote
      </Button>
    </form>
  )
}
