import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"

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
  created_at: string
}

const errorText = (e: unknown) => (e as { message?: string })?.message ?? "Something went wrong."
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n)

const ReviewsPage = () => {
  const client = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ["booking-reviews"],
    queryFn: () => sdk.client.fetch<{ reviews: Review[] }>("/admin/booking/reviews"),
  })
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
          </div>
          <Button
            size="small"
            variant="secondary"
            isLoading={set.isPending && set.variables?.id === r.id}
            onClick={() => set.mutate({ id: r.id, status: r.status === "published" ? "hidden" : "published" })}
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
  label: "Reviews",
})

export default ReviewsPage
