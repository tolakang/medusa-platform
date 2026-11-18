"use client"

import { leaveWaitlist, type MyWaitlistEntry } from "@lib/data/booking"
import { Badge, Button, Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

// Account → Bookings → Waitlist (TASKS P3-29).
export default function WaitlistList({ entries }: { entries: MyWaitlistEntry[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!entries.length) return null
  return (
    <div className="flex flex-col gap-y-3" data-testid="waitlist">
      <Heading level="h2" className="text-large-semi">
        Waitlist
      </Heading>
      {entries.map((w) => (
        <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 border border-ui-border-base rounded-md p-4">
          <div className="flex flex-col gap-y-1">
            <Text className="txt-medium-plus">
              {new Date(`${w.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            </Text>
            <Text className="txt-small text-ui-fg-subtle">
              {w.service ?? "Service"}
              {w.variant_title && w.variant_title !== w.service ? ` · ${w.variant_title}` : ""}
            </Text>
          </div>
          <div className="flex items-center gap-3">
            <Badge>{w.status === "notified" ? "time free" : "waiting"}</Badge>
            {w.status === "notified" && w.handle && (
              <LocalizedClientLink href={`/products/${w.handle}`} className="underline txt-small">
                Book now
              </LocalizedClientLink>
            )}
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await leaveWaitlist(w.id)
                  router.refresh()
                })
              }
            >
              Leave
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
