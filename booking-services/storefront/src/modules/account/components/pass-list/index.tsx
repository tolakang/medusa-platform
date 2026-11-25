import { formatDate } from "@lib/util/format-date"
import type { MyPass } from "@lib/data/booking"
import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Account → Bookings → Passes (TASKS P3-29): credits left and until when.
export default function PassList({ passes }: { passes: MyPass[] }) {
  if (!passes.length) return null
  return (
    <div className="flex flex-col gap-y-3" data-testid="passes">
      <Heading level="h2" className="text-large-semi">
        Passes
      </Heading>
      {passes.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border border-ui-border-base rounded-md p-4">
          <div className="flex flex-col gap-y-1">
            <Text className="txt-medium-plus">{p.title}</Text>
            <Text className="txt-small text-ui-fg-subtle">
              {p.credits_left} of {p.credits_total} left · until{" "}
              {formatDate(p.expires_at)}
            </Text>
          </div>
          {p.credits_left > 0 &&
            p.covers.map((c) => (
              <LocalizedClientLink key={c.handle} href={`/products/${c.handle}`} className="underline txt-small">
                Book {c.title}
              </LocalizedClientLink>
            ))}
        </div>
      ))}
    </div>
  )
}
