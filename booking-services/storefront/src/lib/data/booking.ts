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
  resource: { name: string; timezone: string } | null
  order: { id: string; display_id: number | null } | null
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
