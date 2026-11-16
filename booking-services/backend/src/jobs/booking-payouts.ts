import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isPayoutDay, payoutCutoff, payoutDay, payoutPeriod } from "../lib/provider-commission"
import { createProviderPayoutsWorkflow } from "../workflows/provider-commission"

// Daily at 02:00 UTC (09:00 Cambodia), on the worker (TASKS P3-33). Only on
// BOOKING_PAYOUT_DAY does it make last month's partner payouts; the admin pays
// each one outside Medusa and records it. Running twice on the day changes
// nothing.
export default async function bookingPayouts(container: MedusaContainer) {
  const now = new Date()
  if (!isPayoutDay(now)) {
    return
  }
  const { result } = await createProviderPayoutsWorkflow(container).run({
    input: { cutoff: payoutCutoff(now), period: payoutPeriod(now) },
  })
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(`Partner payout day ${payoutDay()} (${payoutPeriod(now)}): ${result.length} payouts.`)
}

export const config = {
  name: "booking-payouts",
  schedule: "0 2 * * *",
}
