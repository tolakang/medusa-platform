import { Metadata } from "next"

import { listMyQuotes } from "@lib/data/booking"
import QuoteList from "@modules/account/components/quote-list"

export const metadata: Metadata = {
  title: "Quotes",
  description: "Prices the shop sent you.",
}

// Account → Quotes (TASKS P3-27): requests and priced quotes; accept one to
// book it into the cart at that price, or decline it.
export default async function QuotesPage() {
  const quotes = (await listMyQuotes()) ?? []
  return (
    <div className="w-full" data-testid="quotes-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Quotes</h1>
        <p className="text-base-regular">
          Services priced on request. When the shop sends a price and a time, accept it to book it and pay at checkout.
        </p>
      </div>
      <QuoteList quotes={quotes} />
    </div>
  )
}
