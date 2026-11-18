"use client"

import { joinWaitlist } from "@lib/data/booking"
import { Button, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useState, useTransition } from "react"

// A full day (TASKS P3-29): wait for it and get an email when a time frees up.
// The picker keys it by service and day, so a new day starts fresh.
export default function JoinWaitlist({ variantId, date, signedIn }: { variantId: string; date: string; signedIn: boolean }) {
  const [state, setState] = useState<{ joined?: boolean; error?: string }>({})
  const [pending, start] = useTransition()

  if (!signedIn) {
    return (
      <Text className="txt-small text-ui-fg-subtle">
        <LocalizedClientLink href="/account" className="underline">
          Sign in
        </LocalizedClientLink>{" "}
        to join the waitlist for this day.
      </Text>
    )
  }
  if (state.joined) {
    return (
      <Text className="txt-small" data-testid="waitlist-joined">
        You&apos;re on the waitlist. We&apos;ll email you if a time frees up that day.
      </Text>
    )
  }
  return (
    <div className="flex flex-col gap-y-1">
      <Button
        variant="secondary"
        className="self-start"
        isLoading={pending}
        data-testid="waitlist-join"
        onClick={() =>
          start(async () => {
            const r = await joinWaitlist(variantId, date)
            setState(r.error ? { error: r.error } : { joined: true })
          })
        }
      >
        Join the waitlist
      </Button>
      {state.error && <Text className="txt-small text-ui-fg-error">{state.error}</Text>}
    </div>
  )
}
