import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Star } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { errorText, statusLabel } from "../../lib/format"

// Reviews (TASKS P3-29): customers' reviews of bookings they had, newest
// first. They're published at once; Hide takes one off the shop, Show puts
// it back. Reads GET /admin/booking/reviews, writes POST /admin/booking/reviews/:id.

type Review = {
  id: string
  service: string | null
  rating: number
  comment: string | null
  author: string | null
  status: "published" | "hidden"
  reply: string | null
  created_at: string
}

// The shop's public answer under a review (P3-29 follow-up).
const Reply = ({ review, onSaved }: { review: Review; onSaved: () => void }) => {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(review.reply ?? "")
  const save = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/booking/reviews/${review.id}`, { method: "POST", body: { reply: text.trim() || null } }),
    onSuccess: () => {
      setOpen(false)
      onSaved()
      toast.success("Reply saved")
    },
    onError: (e) => toast.error(errorText(e)),
  })
  if (!open) {
    return (
      <div className="flex flex-col gap-y-1">
        {review.reply && (
          <Text size="small" className="border-l-2 border-ui-border-strong pl-2">
            Your reply: {review.reply}
          </Text>
        )}
        <Button size="small" variant="transparent" className="self-start px-0" onClick={() => setOpen(true)}>
          {review.reply ? "Edit reply" : "Reply"}
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-y-2">
      <Textarea aria-label="Reply to the review" value={text} onChange={(e) => setText(e.target.value)} placeholder="Thank the customer, or answer them. Shown under the review." />
      <div className="flex gap-x-2">
        <Button size="small" isLoading={save.isPending} onClick={() => save.mutate()}>
          Save reply
        </Button>
        <Button size="small" variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </div>
  )
}

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n)

const ReviewsPage = () => {
  const client = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ["booking-reviews"],
    queryFn: () => sdk.client.fetch<{ reviews: Review[] }>("/admin/booking/reviews"),
  })
  const prompt = usePrompt()
  const set = useMutation({
    mutationFn: (v: { id: string; status: Review["status"] }) =>
      sdk.client.fetch(`/admin/booking/reviews/${v.id}`, { method: "POST", body: { status: v.status } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["booking-reviews"] }),
  })
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Reviews</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Only customers who had the booking can review it. Reviews show on the service&apos;s page at once; hide any
          you don&apos;t want shown.
        </Text>
      </div>
      {isLoading && <Text className="px-6 py-4">Loading…</Text>}
      {error && <Text className="px-6 py-4 text-ui-fg-error">{errorText(error)}</Text>}
      {data?.reviews.length === 0 && <Text className="px-6 py-4 text-ui-fg-subtle">No reviews yet.</Text>}
      {data?.reviews.map((r) => (
        <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-6 py-4" data-testid="review-row">
          <div className="flex flex-col gap-y-1">
            <div className="flex items-center gap-x-2">
              <Text className="text-ui-tag-orange-icon">{stars(r.rating)}</Text>
              <Text weight="plus">{r.service ?? "Service"}</Text>
              {r.status === "hidden" && <Badge size="2xsmall" color="grey">hidden</Badge>}
            </div>
            {r.comment && <Text size="small" className="whitespace-pre-wrap">{r.comment}</Text>}
            <Text size="xsmall" className="text-ui-fg-subtle">
              {r.author ?? "A customer"} · {new Date(r.created_at).toLocaleDateString()}
            </Text>
            <Reply review={r} onSaved={() => client.invalidateQueries({ queryKey: ["booking-reviews"] })} />
          </div>
          <Button
            size="small"
            variant="secondary"
            isLoading={set.isPending && set.variables?.id === r.id}
            disabled={set.isPending}
            onClick={async () => {
              if (r.status === "published") {
                const ok = await prompt({
                  title: "Hide this review?",
                  description: "It disappears from the shop. You can show it again later.",
                  confirmText: "Hide",
                  cancelText: "Keep it",
                })
                if (!ok) return
              }
              set.mutate({ id: r.id, status: r.status === "published" ? "hidden" : "published" })
            }}
          >
            {r.status === "published" ? "Hide" : "Show"}
          </Button>
        </div>
      ))}
      {set.error && <Text className="px-6 py-4 text-ui-fg-error">{errorText(set.error)}</Text>}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Reviews", icon: Star,
})

export default ReviewsPage
