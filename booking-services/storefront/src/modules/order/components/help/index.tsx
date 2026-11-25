import { Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import React from "react"
import { CONTACT_URL } from "@lib/shop"

// A booked service has no returns or exchanges, only a change or a
// cancellation (TASKS P3-19).
const Help = ({
  showOrders = true,
  servicesOnly = false,
}: { showOrders?: boolean; servicesOnly?: boolean } = {}) => {
  return (
    <div className="mt-6">
      <Heading className="text-base-semi">Need help?</Heading>
      <div className="text-base-regular my-2">
        <ul className="gap-y-2 flex flex-col">
          {CONTACT_URL && (
            <li>
              <a href={CONTACT_URL} target="_blank" rel="noreferrer" className="underline">
                {servicesOnly ? "Change or cancel a booking" : "Contact us"}
              </a>
            </li>
          )}
          {/* Needs an account: a guest would land on sign-in. */}
          {showOrders && (
            <li>
              <LocalizedClientLink href="/account/orders">Your orders</LocalizedClientLink>
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

export default Help
