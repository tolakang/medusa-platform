import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  addToCartWorkflow,
  completeCartWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  BOOKING_QUANTITY_MESSAGE,
  bookingIdOf,
  bookingSeatsOf,
  bookingItemMismatch,
  bookingItemUpdateProblem,
  holdState,
  type BookingItemMetadata,
  type BookingRow,
} from "../../lib/booking-cart-rules"
import {
  EXTRA_FOR_KEY,
  EXTRA_MOVED_MESSAGE,
  extrasProblem,
  isExtraProduct,
} from "../../lib/booking-extras"
import { PASS_EMPTY_MESSAGE, PASS_EXPIRED_MESSAGE, PASS_ITEM_KEY } from "../../lib/passes"
import { BOOKING_MODULE } from "../../modules/booking"
import type BookingModuleService from "../../modules/booking/service"

// TASKS P3-05 (BUILD_PLAN §9.3): the cart hooks for bookings and, since
// P3-25, their extras. All three only
// read and throw; none of them changes the cart (the completeCartWorkflow
// reference forbids mutating the cart in its validate hook).

type CartItemInput = {
  id?: string
  variant_id?: string | null
  quantity?: unknown
  metadata?: BookingItemMetadata
}

const refuse = (message: string): never => {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message)
}

async function cartItems(container: MedusaContainer, cartId: string): Promise<CartItemInput[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "items.id", "items.variant_id", "items.quantity", "items.metadata"],
    filters: { id: cartId },
  })
  return (cart?.items ?? []).filter(Boolean) as CartItemInput[]
}

// Variants that a booking resource offers (link P3-02) are services: they
// can only be in a cart with a booked time.
async function serviceVariantIds(
  container: MedusaContainer,
  variantIds: string[]
): Promise<Set<string>> {
  if (!variantIds.length) {
    return new Set()
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "booking_resources.id"],
    filters: { id: variantIds },
  })
  return new Set(data.filter((v) => (v.booking_resources ?? []).length > 0).map((v) => v.id))
}

// Extras (P3-25): every line of an extra product must belong to a booking
// line in the same cart (in the cart already, or added with it).
async function assertExtras(container: MedusaContainer, lines: CartItemInput[]) {
  const variantIds = [...new Set(lines.map((l) => l.variant_id).filter((v): v is string => !!v))]
  if (!variantIds.length) {
    return
  }
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product_variant",
    fields: ["id", "product.metadata"],
    filters: { id: variantIds },
  })
  const extraVariants = new Set(data.filter((v) => isExtraProduct(v.product)).map((v) => v.id))
  if (!extraVariants.size) {
    return
  }
  const bookingIds = new Set(lines.map((l) => bookingIdOf(l.metadata)).filter((id): id is string => !!id))
  const problem = extrasProblem(
    lines.map((l) => ({ metadata: l.metadata, is_extra: !!l.variant_id && extraVariants.has(l.variant_id) })),
    bookingIds
  )
  if (problem) {
    refuse(problem)
  }
}

// Checks booking items against their holds. `checkout` re-checks a hold that
// has run out: if nobody has taken the slot meanwhile, it still counts
// (the cart's own hold is ignored, so a retried completion stays valid).
async function assertBookingItems(
  container: MedusaContainer,
  cartId: string,
  items: CartItemInput[],
  { checkout }: { checkout: boolean }
) {
  const services = await serviceVariantIds(
    container,
    [...new Set(items.map((i) => i.variant_id).filter((v): v is string => !!v))]
  )
  const bookingIds = items.map((i) => bookingIdOf(i.metadata)).filter((id): id is string => !!id)

  for (const item of items) {
    if (item.variant_id && services.has(item.variant_id) && !bookingIdOf(item.metadata)) {
      refuse("Please choose a time to book this service.")
    }
    if (bookingIdOf(item.metadata) && item.quantity !== undefined && Number(item.quantity) !== bookingSeatsOf(item.metadata)) {
      refuse(BOOKING_QUANTITY_MESSAGE)
    }
  }
  if (new Set(bookingIds).size !== bookingIds.length) {
    refuse("This booking is already in the cart.")
  }
  if (!bookingIds.length) {
    return
  }

  const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
  const rows = (await booking.listBookings({ id: bookingIds })) as unknown as BookingRow[]
  const byId = new Map(rows.map((b) => [b.id, b]))
  const now = new Date()

  for (const item of items) {
    const id = bookingIdOf(item.metadata)
    if (!id) {
      continue
    }
    const row = byId.get(id)
    const mismatch = bookingItemMismatch(item.metadata, row, cartId)
    if (mismatch) {
      refuse(mismatch)
    }
    const state = holdState(row!, now)
    if (state === "released") {
      refuse("This booking was released. Please choose the time again.")
    }
    if (state === "expired_hold") {
      const check = await booking.checkSlot({
        resource_id: row!.resource_id,
        starts_at: new Date(row!.starts_at),
        ends_at: new Date(row!.ends_at),
        ignore_cart_id: cartId,
        now,
      })
      if (!check.available) {
        refuse(
          checkout
            ? "Your hold on this time ran out and the time was taken. Please choose another time."
            : "This time is no longer available."
        )
      }
    }
  }
}

// Adding to the cart: new items must be valid bookings (or not services),
// and a booking can't be added twice.
addToCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const existing = await cartItems(container, input.cart_id)
  const added = (input.items ?? []) as CartItemInput[]
  const existingIds = new Set(existing.map((i) => bookingIdOf(i.metadata)).filter(Boolean))
  for (const item of added) {
    const id = bookingIdOf(item.metadata)
    if (id && existingIds.has(id)) {
      refuse("This booking is already in the cart.")
    }
  }
  await assertBookingItems(container, input.cart_id, added, { checkout: false })
  await assertExtras(container, [...existing, ...added])
})

// Changing an item: a booking stays one place with its booked time.
updateLineItemInCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const items = await cartItems(container, input.cart_id)
  const item = items.find((i) => i.id === input.item_id)
  if (!item) {
    return
  }
  const problem = bookingItemUpdateProblem(item.metadata, {
    quantity: input.update?.quantity,
    metadata: input.update?.metadata as BookingItemMetadata,
  })
  if (problem) {
    refuse(problem)
  }
  // An extra stays with its booking (P3-25).
  const update = input.update?.metadata as BookingItemMetadata
  if (item.metadata?.[EXTRA_FOR_KEY] && update !== undefined && update?.[EXTRA_FOR_KEY] !== item.metadata[EXTRA_FOR_KEY]) {
    refuse(EXTRA_MOVED_MESSAGE)
  }
})

// Completing the cart (read-only, idempotent on retry): every booking item
// still has its slot, and no service is in the cart without a booking.
// Bookings paid with a pass (TASKS P3-29): at checkout the pass must still
// have a credit for each of them and not have expired (another cart may have
// used it since).
async function assertPassCredits(container: MedusaContainer, items: CartItemInput[]) {
  const wanted = new Map<string, number>()
  for (const item of items) {
    const id = (item.metadata as Record<string, unknown> | null | undefined)?.[PASS_ITEM_KEY]
    if (typeof id === "string") wanted.set(id, (wanted.get(id) ?? 0) + 1)
  }
  if (!wanted.size) return
  const passes = await container.resolve<BookingModuleService>(BOOKING_MODULE).listBookingPasses({ id: [...wanted.keys()] })
  for (const [id, count] of wanted) {
    const pass = passes.find((p) => p.id === id)
    if (!pass || pass.credits_left < count) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PASS_EMPTY_MESSAGE)
    }
    if (new Date(pass.expires_at).getTime() < Date.now()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PASS_EXPIRED_MESSAGE)
    }
  }
}

completeCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const items = await cartItems(container, input.id)
  await assertBookingItems(container, input.id, items, { checkout: true })
  await assertExtras(container, items)
  await assertPassCredits(container, items)
})
