"use server"

import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import medusaError from "@lib/util/medusa-error"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import { getAuthHeaders, getCacheTag, getCartId } from "./cookies"
import { getOrSetCart, retrieveCart } from "./cart"

// Booking calls of the storefront (TASKS P3-13), against the backend's
// /store/booking/* routes (P3-10) and /store/customers/me/bookings.

export type Slot = {
  resource_id: string
  resource_name?: string
  timezone?: string
  starts_at: string
  ends_at: string
  remaining: number
}

export type MyBooking = {
  id: string
  status: string
  starts_at: string
  ends_at: string
  notes: string | null
  address?: string | null
  dropoff_address?: string | null
  seats?: number
  // A weekly series (P3-29).
  series_id?: string | null
  // A piece of an event package (P3-30).
  package_id?: string | null
  resource: { id?: string; name: string; timezone: string } | null
  order: { id: string; display_id: number | null } | null
  // The service booked, for changing the time (P3-28).
  variant_id?: string | null
  // For reviews (P3-29).
  product_id?: string | null
  reviewed?: boolean
}

export async function listSlots(
  variantId: string,
  date: string,
  // A trip's length (kind C, P3-21): hours × 60, or the zone pair's minutes.
  durationMinutes?: number
): Promise<{ slots: Slot[]; error?: string }> {
  return sdk.client
    .fetch<{ slots: Slot[] }>("/store/booking/slots", {
      query: { variant_id: variantId, date, ...(durationMinutes ? { duration_minutes: String(durationMinutes) } : {}) },
      headers: await getAuthHeaders(),
      cache: "no-store",
    })
    .then((r) => ({ slots: r.slots }))
    .catch((e) => ({ slots: [], error: e?.message ?? "Could not load times." }))
}

export async function addBookingToCart(input: {
  countryCode: string
  variantId: string
  slot: Slot
  // A visit at the customer's place (kind B, TASKS P3-20); a trip's pickup.
  address?: string
  notes?: string
  // A trip (kind C, TASKS P3-21).
  dropoffAddress?: string
  hours?: number
  fromZoneId?: string
  toZoneId?: string
  // Seats on a departure (kind D, TASKS P3-23).
  seats?: number
  // Extras with the booking (TASKS P3-25).
  extras?: { variant_id: string; quantity: number }[]
  // Pay with a pass credit (TASKS P3-29).
  passId?: string
}): Promise<{ error?: string }> {
  const cart = await getOrSetCart(input.countryCode)
  if (!cart) {
    return { error: "Could not open your cart." }
  }
  try {
    await sdk.client.fetch("/store/booking/cart", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: {
        cart_id: cart.id,
        variant_id: input.variantId,
        resource_id: input.slot.resource_id,
        starts_at: input.slot.starts_at,
        ends_at: input.slot.ends_at,
        ...(input.address ? { address: input.address } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.dropoffAddress ? { dropoff_address: input.dropoffAddress } : {}),
        ...(input.hours ? { hours: input.hours } : {}),
        ...(input.fromZoneId ? { from_zone_id: input.fromZoneId, to_zone_id: input.toZoneId } : {}),
        ...(input.seats && input.seats > 1 ? { seats: input.seats } : {}),
        ...(input.extras?.length ? { extras: input.extras } : {}),
        ...(input.passId ? { pass_id: input.passId } : {}),
      },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "This time can't be booked." }
  }
  revalidateTag(await getCacheTag("carts"), { expire: 0 })
  return {}
}

// Checkout contact for a cart of services (no delivery): name, email and
// phone on the cart and both addresses (the backend's contact rule reads
// the email or the shipping address phone, F-048).
export async function setServiceContact(_state: unknown, formData: FormData): Promise<string | null> {
  const cartId = await getCartId()
  if (!cartId) {
    return "No cart found."
  }
  const cart = await retrieveCart(cartId)
  const email = String(formData.get("email") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  if (!email) {
    return "Add your email so we can send the confirmation and a reminder."
  }
  const address = {
    first_name: String(formData.get("first_name") ?? "").trim(),
    last_name: String(formData.get("last_name") ?? "").trim(),
    phone,
    country_code: cart?.shipping_address?.country_code ?? cart?.region?.countries?.[0]?.iso_2 ?? undefined,
  }
  try {
    await sdk.store.cart.update(
      cartId,
      { email, shipping_address: address, billing_address: address },
      {},
      await getAuthHeaders()
    )
  } catch (e) {
    return (e as { message?: string })?.message ?? "Could not save your details."
  }
  revalidateTag(await getCacheTag("carts"), { expire: 0 })
  redirect(`/${String(formData.get("country_code") ?? "")}/checkout?step=payment`)
}

export async function listMyBookings(): Promise<MyBooking[] | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return null
  }
  return sdk.client
    .fetch<{ bookings: MyBooking[] }>("/store/customers/me/bookings", { headers, cache: "no-store" })
    .then((r) => r.bookings)
    .catch(medusaError)
}

export async function cancelMyBooking(
  bookingId: string
): Promise<{ refund?: string; refunded_amount?: number; error?: string }> {
  try {
    return await sdk.client.fetch<{ refund: string; refunded_amount: number }>("/store/booking/cancel", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: { booking_id: bookingId },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Could not cancel this booking." }
  }
}

// A zone-priced trip's zones and price table (TASKS P3-21).
export type TripZones = {
  zones: { id: string; name: string }[]
  prices: { from_zone_id: string; to_zone_id: string; amount: number; currency_code: string; minutes: number }[]
}

export async function listTripZones(variantId: string): Promise<TripZones> {
  return sdk.client
    .fetch<TripZones>("/store/booking/zones", { query: { variant_id: variantId }, cache: "no-store" })
    .catch(() => ({ zones: [], prices: [] }))
}

// A rental's availability for its dates (TASKS P3-22).
export type RentalAvailability = {
  unit: "day" | "night"
  units: number
  items: { resource_id: string; resource_name: string; remaining: number }[]
}

export async function rentalAvailability(
  variantId: string,
  startDate: string,
  endDate: string
): Promise<{ data?: RentalAvailability; error?: string }> {
  return sdk.client
    .fetch<RentalAvailability>("/store/booking/rentals", {
      query: { variant_id: variantId, start_date: startDate, end_date: endDate },
      cache: "no-store",
    })
    .then((data) => ({ data }))
    .catch((e) => ({ error: e?.message ?? "Could not check these dates." }))
}

// Holds a rental for its dates and adds it to the cart (P3-22).
export async function addRentalToCart(input: {
  countryCode: string
  variantId: string
  resourceId: string
  startDate: string
  endDate: string
  // Extras with the rental (P3-25 follow-up).
  extras?: { variant_id: string; quantity: number }[]
  // Pay with a pass: a credit per day or night (P3-29 follow-up).
  passId?: string
}): Promise<{ error?: string }> {
  const cart = await getOrSetCart(input.countryCode)
  if (!cart) {
    return { error: "Could not open your cart." }
  }
  try {
    await sdk.client.fetch("/store/booking/cart", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: {
        cart_id: cart.id,
        variant_id: input.variantId,
        resource_id: input.resourceId,
        start_date: input.startDate,
        end_date: input.endDate,
        ...(input.extras?.length ? { extras: input.extras } : {}),
        ...(input.passId ? { pass_id: input.passId } : {}),
      },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "These dates can't be booked." }
  }
  revalidateTag(await getCacheTag("carts"), { expire: 0 })
  return {}
}

// An order's event tickets with their codes (TASKS P3-24).
export type EventTicket = { code: string; event_title: string; label: string; status: "valid" | "used" }

export async function listOrderTickets(orderId: string): Promise<EventTicket[]> {
  return sdk.client
    .fetch<{ tickets: EventTicket[] }>("/store/booking/tickets", { query: { order_id: orderId }, cache: "no-store" })
    .then((r) => r.tickets)
    .catch(() => [])
}

// The extras a service offers (TASKS P3-25), with prices in the region.
export async function listExtras(handles: string[], countryCode: string): Promise<HttpTypes.StoreProduct[]> {
  if (!handles.length) {
    return []
  }
  const { listProducts } = await import("./products")
  return listProducts({ countryCode, queryParams: { handle: handles, limit: handles.length } as never })
    .then(({ response }) => response.products)
    .catch(() => [])
}

// Quotes (TASKS P3-27).
export type MyQuote = {
  id: string
  service: string | null
  details: string
  address: string | null
  dropoff_address: string | null
  wished_starts_at: string
  status: "requested" | "quoted" | "accepted" | "declined" | "expired"
  amount: number | null
  currency_code: string | null
  starts_at: string | null
  ends_at: string | null
  reply: string | null
  valid_until: string | null
  // The calendar's (or shop's) time zone.
  timezone?: string | null
}

export async function listMyQuotes(): Promise<MyQuote[] | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return null
  }
  return sdk.client
    .fetch<{ quotes: MyQuote[] }>("/store/booking/quotes", { headers, cache: "no-store" })
    .then((r) => r.quotes)
    .catch(medusaError)
}

export async function requestQuote(input: {
  variantId: string
  details: string
  wishedStartsAt: string
  address?: string
  dropoffAddress?: string
}): Promise<{ error?: string }> {
  try {
    await sdk.client.fetch("/store/booking/quotes", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: {
        variant_id: input.variantId,
        details: input.details,
        wished_starts_at: input.wishedStartsAt,
        ...(input.address ? { address: input.address } : {}),
        ...(input.dropoffAddress ? { dropoff_address: input.dropoffAddress } : {}),
      },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Could not send your request." }
  }
  return {}
}

// Book an accepted quote into the cart, then go to the cart.
export async function acceptQuote(countryCode: string, quoteId: string): Promise<{ error?: string }> {
  const cart = await getOrSetCart(countryCode)
  if (!cart) {
    return { error: "Could not open your cart." }
  }
  const headers = await getAuthHeaders()
  try {
    if (!cart.customer_id) {
      // The quote is the customer's: the cart must be theirs too.
      await sdk.store.cart.transferCart(cart.id, {}, headers)
    }
    await sdk.client.fetch(`/store/booking/quotes/${quoteId}/accept`, { method: "POST", headers, body: { cart_id: cart.id } })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "This quote can't be booked." }
  }
  revalidateTag(await getCacheTag("carts"), { expire: 0 })
  redirect(`/${countryCode}/cart`)
}

export async function declineQuote(quoteId: string): Promise<{ error?: string }> {
  try {
    await sdk.client.fetch(`/store/booking/quotes/${quoteId}/decline`, { method: "POST", headers: await getAuthHeaders() })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Could not decline this quote." }
  }
  return {}
}

// Move a booking to another free time (TASKS P3-28).
export async function moveMyBooking(bookingId: string, slot: Slot): Promise<{ error?: string }> {
  try {
    await sdk.client.fetch("/store/booking/move", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: { booking_id: bookingId, resource_id: slot.resource_id, starts_at: slot.starts_at, ends_at: slot.ends_at },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "This booking can't be moved." }
  }
  return {}
}

// Waitlist (TASKS P3-29).
export type MyWaitlistEntry = {
  id: string
  date: string
  status: "waiting" | "notified"
  service: string | null
  variant_title: string | null
  handle: string | null
}

export async function joinWaitlist(variantId: string, date: string): Promise<{ error?: string }> {
  try {
    await sdk.client.fetch("/store/booking/waitlist", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: { variant_id: variantId, date },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Could not join the waitlist." }
  }
  return {}
}

export async function listMyWaitlist(): Promise<MyWaitlistEntry[] | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return null
  }
  return sdk.client
    .fetch<{ waitlist: MyWaitlistEntry[] }>("/store/booking/waitlist", { headers, cache: "no-store" })
    .then((r) => r.waitlist)
    .catch(medusaError)
}

export async function leaveWaitlist(id: string): Promise<{ error?: string }> {
  try {
    await sdk.client.fetch(`/store/booking/waitlist/${id}/leave`, { method: "POST", headers: await getAuthHeaders() })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Could not leave the waitlist." }
  }
  return {}
}

// Reviews (TASKS P3-29).
export type ServiceReviews = {
  average: number | null
  count: number
  reviews: { id: string; rating: number; comment: string | null; author: string | null; reply?: string | null; created_at: string }[]
}

export async function listServiceReviews(productId: string): Promise<ServiceReviews> {
  return sdk.client
    .fetch<ServiceReviews>("/store/booking/reviews", { query: { product_id: productId }, cache: "no-store" })
    .catch(() => ({ average: null, count: 0, reviews: [] }))
}

export async function writeReview(bookingId: string, rating: number, comment: string): Promise<{ error?: string }> {
  try {
    await sdk.client.fetch("/store/booking/reviews", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: { booking_id: bookingId, rating, ...(comment.trim() ? { comment: comment.trim() } : {}) },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Could not save your review." }
  }
  return {}
}

// Passes (TASKS P3-29).
export type MyPass = {
  id: string
  title: string
  credits_total: number
  credits_left: number
  expires_at: string
  covers: { handle: string; title: string }[]
}

export async function listMyPasses(): Promise<MyPass[]> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return []
  }
  return sdk.client
    .fetch<{ passes: MyPass[] }>("/store/booking/passes", { headers, cache: "no-store" })
    .then((r) => r.passes)
    .catch(() => [])
}

// The same time every week, 2-12 weeks (TASKS P3-29): all weeks or none.
export async function addRecurringToCart(input: {
  countryCode: string
  variantId: string
  slot: Slot
  weeks: number
  // How often (P3-29 follow-up).
  every?: "week" | "2weeks" | "month"
  address?: string
  notes?: string
}): Promise<{ error?: string }> {
  const cart = await getOrSetCart(input.countryCode)
  if (!cart) {
    return { error: "Could not open your cart." }
  }
  try {
    await sdk.client.fetch("/store/booking/recurring", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: {
        cart_id: cart.id,
        variant_id: input.variantId,
        resource_id: input.slot.resource_id,
        starts_at: input.slot.starts_at,
        ends_at: input.slot.ends_at,
        weeks: input.weeks,
        ...(input.every && input.every !== "week" ? { every: input.every } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "These weeks can't be booked." }
  }
  revalidateTag(await getCacheTag("carts"), { expire: 0 })
  return {}
}

// An event package on its date (TASKS P3-30): all pieces or none.
export async function addPackageToCart(input: {
  countryCode: string
  variantId: string
  date: string
  address?: string
  notes?: string
  // À la carte: the pieces chosen (P3-30).
  choices?: number[]
}): Promise<{ error?: string }> {
  const cart = await getOrSetCart(input.countryCode)
  if (!cart) {
    return { error: "Could not open your cart." }
  }
  try {
    await sdk.client.fetch("/store/booking/package", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: {
        cart_id: cart.id,
        variant_id: input.variantId,
        date: input.date,
        ...(input.address ? { address: input.address } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.choices ? { choices: input.choices } : {}),
      },
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "This package can't be booked on that date." }
  }
  revalidateTag(await getCacheTag("carts"), { expire: 0 })
  return {}
}

// Cancel a whole event package (TASKS P3-30).
export async function cancelMyPackage(packageId: string): Promise<{ refund?: string; refunded_amount?: number; error?: string }> {
  try {
    return await sdk.client.fetch<{ refund: string; refunded_amount: number }>(`/store/booking/package/${packageId}/cancel`, {
      method: "POST",
      headers: await getAuthHeaders(),
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Could not cancel this package." }
  }
}

// Cancel the rest of a weekly series (TASKS P3-29 follow-up).
export async function cancelMySeries(seriesId: string): Promise<{ cancelled?: number; refunded_amount?: number; error?: string }> {
  try {
    return await sdk.client.fetch<{ cancelled: number; refunded_amount: number }>(`/store/booking/series/${seriesId}/cancel`, {
      method: "POST",
      headers: await getAuthHeaders(),
    })
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Could not cancel the series." }
  }
}

// A service's average rating for its card (P3-29 follow-up): cached for five
// minutes, so a page of cards doesn't ask on every view.
export async function reviewSummary(productId: string): Promise<{ average: number | null; count: number }> {
  return sdk.client
    .fetch<ServiceReviews>("/store/booking/reviews", { query: { product_id: productId }, next: { revalidate: 300 } })
    .then((r) => ({ average: r.average, count: r.count }))
    .catch(() => ({ average: null, count: 0 }))
}

// Event tickets with extras (TASKS P3-25 follow-up): the ticket line gets a
// group id and each extra points at it, so the extras stay with these tickets
// (the backend checks the group is in the cart).
export async function addTicketsToCart(input: {
  countryCode: string
  variantId: string
  quantity: number
  extras?: { variant_id: string; quantity: number }[]
}): Promise<{ error?: string }> {
  const cart = await getOrSetCart(input.countryCode)
  if (!cart) {
    return { error: "Could not open your cart." }
  }
  const headers = await getAuthHeaders()
  const group = `tkt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  // Lines this call added, taken back out if a later one fails (review
  // finding: tickets could stay without their extras).
  const added: string[] = []
  const lineOf = (c: { cart: HttpTypes.StoreCart }, variantId: string, key: string, value: string) =>
    c.cart.items?.find((i) => i.variant_id === variantId && (i.metadata as Record<string, unknown> | null)?.[key] === value)?.id
  try {
    const first = await sdk.store.cart.createLineItem(
      cart.id,
      { variant_id: input.variantId, quantity: input.quantity, metadata: { booking_ticket_group: group } },
      {},
      headers
    )
    const ticketLine = lineOf(first, input.variantId, "booking_ticket_group", group)
    if (ticketLine) added.push(ticketLine)
    for (const x of input.extras ?? []) {
      const next = await sdk.store.cart.createLineItem(
        cart.id,
        { variant_id: x.variant_id, quantity: x.quantity, metadata: { booking_extra_for: group, line_detail: "With your tickets" } },
        {},
        headers
      )
      const extraLine = lineOf(next, x.variant_id, "booking_extra_for", group)
      if (extraLine) added.push(extraLine)
    }
  } catch (e) {
    for (const id of added.reverse()) {
      await sdk.store.cart.deleteLineItem(cart.id, id, {}, headers).catch(() => undefined)
    }
    revalidateTag(await getCacheTag("carts"), { expire: 0 })
    return { error: (e as { message?: string })?.message ?? "These tickets can't be added." }
  }
  revalidateTag(await getCacheTag("carts"), { expire: 0 })
  return {}
}
