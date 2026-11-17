import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { QUOTE_NOT_PRICED_MESSAGE, QUOTE_NOT_YOURS_MESSAGE } from "../../../../../../lib/quotes"
import { BOOKING_MODULE } from "../../../../../../modules/booking"
import type BookingModuleService from "../../../../../../modules/booking/service"
import { addBookingToCartWorkflow } from "../../../../../../workflows/add-booking-to-cart"
import type { PostQuoteAcceptType } from "../../../validators"

// POST /store/booking/quotes/:id/accept { cart_id } (TASKS P3-27): book the
// priced quote into the cart at its price, calendar and time; the quote
// becomes "accepted" when the order is placed.
export const POST = async (req: AuthenticatedMedusaRequest<PostQuoteAcceptType>, res: MedusaResponse) => {
  const [quote] = await req.scope
    .resolve<BookingModuleService>(BOOKING_MODULE)
    .listBookingQuotes({ id: req.params.id, customer_id: req.auth_context.actor_id })
  if (!quote) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, QUOTE_NOT_YOURS_MESSAGE)
  }
  if (!quote.resource_id || !quote.starts_at || !quote.ends_at) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, QUOTE_NOT_PRICED_MESSAGE)
  }
  const { result } = await addBookingToCartWorkflow(req.scope).run({
    input: {
      cart_id: req.validatedBody.cart_id,
      variant_id: quote.variant_id,
      resource_id: quote.resource_id,
      starts_at: new Date(quote.starts_at).toISOString(),
      ends_at: new Date(quote.ends_at).toISOString(),
      notes: quote.details,
      quote_id: quote.id,
    },
  })
  res.json({
    booking: { id: result.booking.id, status: result.booking.status, starts_at: result.booking.starts_at, ends_at: result.booking.ends_at },
    line_item_id: result.line_item_id,
  })
}
