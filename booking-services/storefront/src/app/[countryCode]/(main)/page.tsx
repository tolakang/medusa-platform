import { Metadata } from "next"

import { getRegion } from "@lib/data/regions"
import { SHOP_NAME } from "@lib/shop"
import BookingKinds from "@modules/home/components/booking-kinds"
import Hero from "@modules/home/components/hero"

export const metadata: Metadata = {
  title: SHOP_NAME,
  description: "Choose a service, pick a free time and book it online.",
}

// Booking-only home page (TASKS P3-19): an opening line, then the services by
// booking kind.
export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  return (
    <>
      <Hero />
      <BookingKinds region={region} />
    </>
  )
}
