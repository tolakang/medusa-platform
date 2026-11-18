import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PACKAGE_CANCELLED_EVENT, type PackageCancelledData } from "../workflows/cancel-package"
import { notifyPackageChangedWorkflow } from "../workflows/notify-package-changed"

// TASKS P3-30 follow-up: when staff cancel an event package, the customer is
// emailed (with the refund, if any). A customer's own cancel needs no email.
export default async function bookingPackageCancelledHandler({ event: { data }, container }: SubscriberArgs<PackageCancelledData>) {
  if (data.by !== "staff") return
  await notifyPackageChangedWorkflow(container).run({
    input: { package_id: data.package_id, kind: "cancelled", refunded_amount: data.refunded_amount },
  })
}

export const config: SubscriberConfig = { event: PACKAGE_CANCELLED_EVENT }
