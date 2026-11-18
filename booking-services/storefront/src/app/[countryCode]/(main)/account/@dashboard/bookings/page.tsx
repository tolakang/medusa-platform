import { Metadata } from "next"

import { listMyBookings, listMyPasses, listMyWaitlist } from "@lib/data/booking"
import BookingList from "@modules/account/components/booking-list"
import WaitlistList from "@modules/account/components/waitlist-list"
import PassList from "@modules/account/components/pass-list"

export const metadata: Metadata = {
  title: "Bookings",
  description: "Your booked times.",
}

// Account → Bookings (TASKS P3-13): the customer's bookings, upcoming first,
// with cancel (the shop's cancellation policy decides any refund, P3-08).
// Upcoming (held or confirmed, not over yet, soonest first) and the rest, as
// of the request (a server page renders once per request).
function splitBookings<T extends { status: string; starts_at: string; ends_at: string }>(bookings: T[], now = Date.now()) {
  const active = (s: string) => s === "confirmed" || s === "pending"
  const upcoming = bookings
    .filter((b) => active(b.status) && new Date(b.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  return { upcoming, past: bookings.filter((b) => !upcoming.includes(b)) }
}

export default async function BookingsPage() {
  const [bookings, waitlist, passes] = await Promise.all([
    listMyBookings().then((b) => b ?? []),
    listMyWaitlist().then((w) => w ?? []),
    listMyPasses(),
  ])
  const { upcoming, past } = splitBookings(bookings)

  return (
    <div className="w-full" data-testid="bookings-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Bookings</h1>
        <p className="text-base-regular">
          Your booked times. Cancel a booking here if you can&apos;t come: cancelling early enough is refunded under
          the shop&apos;s cancellation policy.
        </p>
      </div>
      <div className="flex flex-col gap-y-8">
        <BookingList title="Upcoming" bookings={upcoming} canCancel empty="No upcoming bookings." />
        <PassList passes={passes} />
        <WaitlistList entries={waitlist} />
        {past.length > 0 && <BookingList title="Past and cancelled" bookings={past} empty="" />}
      </div>
    </div>
  )
}
