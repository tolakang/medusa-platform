import { listServiceReviews } from "@lib/data/booking"

const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n))

// A service's reviews from customers who had it (TASKS P3-29).
export default async function ServiceReviews({ productId }: { productId: string }) {
  const { average, count, reviews } = await listServiceReviews(productId)
  if (!count) return null
  return (
    <div className="flex flex-col gap-y-4" data-testid="service-reviews">
      <div className="flex items-baseline gap-x-3">
        <h2 className="text-xl-semi">Reviews</h2>
        <span className="txt-medium text-ui-fg-subtle">
          <span aria-hidden>{stars(average ?? 0)}</span> {average?.toFixed(1)} · {count} {count === 1 ? "review" : "reviews"}
        </span>
      </div>
      <ul className="flex flex-col gap-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="border-b border-ui-border-base pb-4">
            <p className="txt-medium" aria-label={`${r.rating} out of 5`}>
              {stars(r.rating)}
            </p>
            {r.comment && <p className="txt-medium mt-1 whitespace-pre-wrap">{r.comment}</p>}
            {r.reply && (
              <p className="txt-small mt-2 border-l-2 border-ui-border-strong pl-3 whitespace-pre-wrap" data-testid="review-reply">
                <span className="txt-small-plus">Reply from the shop:</span> {r.reply}
              </p>
            )}
            <p className="txt-small text-ui-fg-subtle mt-1">
              {r.author ?? "A customer"} · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
