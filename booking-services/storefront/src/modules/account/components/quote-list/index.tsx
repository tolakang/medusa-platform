"use client"

import { acceptQuote, declineQuote, type MyQuote } from "@lib/data/booking"
import { convertToLocale } from "@lib/util/money"
import { Button } from "@modules/common/components/ui"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"

const LABELS: Record<MyQuote["status"], string> = {
  requested: "Waiting for a price",
  quoted: "Priced",
  accepted: "Booked",
  declined: "Declined",
  expired: "Expired",
}
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export default function QuoteList({ quotes }: { quotes: MyQuote[] }) {
  const { countryCode } = useParams() as { countryCode: string }
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<Record<string, string>>({})

  if (!quotes.length) {
    return <p className="txt-medium text-ui-fg-subtle">No quotes yet. Ask for one on a service marked “Price on quote”.</p>
  }
  const act = async (id: string, fn: () => Promise<{ error?: string }>) => {
    setBusy(id)
    const r = await fn()
    setBusy(null)
    if (r?.error) setError((e) => ({ ...e, [id]: r.error! }))
    else router.refresh()
  }
  return (
    <ul className="flex flex-col gap-y-4">
      {quotes.map((q) => (
        <li key={q.id} className="rounded-lg border border-ui-border-base p-4" data-testid="quote-item">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="txt-medium-plus">{q.service ?? "Service"}</p>
            <span className="txt-small text-ui-fg-subtle" data-testid="quote-status">
              {LABELS[q.status]}
            </span>
          </div>
          <p className="txt-small text-ui-fg-subtle whitespace-pre-wrap">{q.details}</p>
          {q.status === "quoted" && q.amount !== null && q.starts_at && (
            <div className="mt-3 flex flex-col gap-y-2">
              <p className="txt-medium">
                <strong>{convertToLocale({ amount: q.amount, currency_code: q.currency_code ?? "usd" })}</strong> · {when(q.starts_at)}
              </p>
              {q.reply && <p className="txt-small">{q.reply}</p>}
              {q.valid_until && <p className="txt-small text-ui-fg-subtle">Valid until {new Date(q.valid_until).toLocaleDateString("en-GB")}</p>}
              <div className="flex gap-x-2">
                <Button size="small" isLoading={busy === q.id} onClick={() => act(q.id, () => acceptQuote(countryCode, q.id))} data-testid="quote-accept">
                  Accept and book
                </Button>
                <Button size="small" variant="secondary" disabled={busy === q.id} onClick={() => act(q.id, () => declineQuote(q.id))}>
                  Decline
                </Button>
              </div>
            </div>
          )}
          {error[q.id] && <p className="mt-2 txt-small text-ui-fg-error">{error[q.id]}</p>}
        </li>
      ))}
    </ul>
  )
}
