// Quote first (TASKS P3-27): a quote-only service (product
// metadata.quote_only = true) can't be booked straight away; the customer
// asks for a quote, staff price it, and the accepted quote is booked at that
// price. Pure helpers, unit-tested in __tests__/quotes.unit.spec.ts.

type Meta = Record<string, unknown> | null | undefined

export const QUOTE_TEMPLATE = "booking-quote"
export const QUOTE_ITEM_KEY = "booking_quote_id"
export const DEFAULT_QUOTE_VALID_DAYS = 7

export const QUOTE_ONLY_MESSAGE = "This service is priced on request. Ask for a quote first."
export const QUOTE_NOT_YOURS_MESSAGE = "This quote was not found."
export const QUOTE_NOT_OPEN_MESSAGE = "This quote can't be booked any more."
export const QUOTE_NOT_PRICED_MESSAGE = "This quote hasn't been priced yet."
export const QUOTE_SIGN_IN_MESSAGE = "Sign in to ask for a quote, so you can see and accept it."

export const isQuoteOnly = (product: { metadata?: Meta } | null | undefined) => product?.metadata?.quote_only === true

/** Whether a quote can be booked now. */
export function quoteBookable(
  quote: { status: string; amount?: unknown; starts_at?: unknown; valid_until?: Date | string | null },
  now = new Date()
): string | null {
  if (quote.status !== "quoted") {
    return quote.status === "requested" ? QUOTE_NOT_PRICED_MESSAGE : QUOTE_NOT_OPEN_MESSAGE
  }
  if (quote.amount === null || quote.amount === undefined || !quote.starts_at) {
    return QUOTE_NOT_PRICED_MESSAGE
  }
  if (quote.valid_until && new Date(quote.valid_until).getTime() < now.getTime()) {
    return QUOTE_NOT_OPEN_MESSAGE
  }
  return null
}

export type QuoteEmailData = {
  customer_name?: string | null
  service: string
  amount: number
  currency_code: string
  when: string
  reply?: string | null
  valid_until: string
  url?: string | null
}

export function quoteEmail(data: QuoteEmailData, escape: (s: string) => string) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency_code.toUpperCase() }).format(data.amount)
  const hello = data.customer_name ? `Hello ${escape(data.customer_name)},` : "Hello,"
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>Your quote</h2>
<p>${hello}</p>
<p>Here is our price for <strong>${escape(data.service)}</strong>:</p>
<p style="font-size:18px"><strong>${escape(money)}</strong> · ${escape(data.when)}</p>
${data.reply ? `<p>${escape(data.reply)}</p>` : ""}
<p>To book it, accept the quote in your account by ${escape(data.valid_until)}${
    data.url ? ` (<a href="${escape(data.url)}">your quotes</a>)` : ""
  }.</p>
</body></html>`
  return { subject: `Your quote: ${data.service}, ${money}`, html }
}
