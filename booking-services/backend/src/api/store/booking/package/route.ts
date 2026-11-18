import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { randomUUID } from "crypto"
import {
  addDays,
  eventDateOk,
  PACKAGE_DATE_KEY,
  PACKAGE_DATE_MESSAGE,
  PACKAGE_ITEM_KEY,
  PACKAGE_NOT_MESSAGE,
  packagePieces,
} from "../../../../lib/packages"
import { rentalSpan, rentalUnit } from "../../../../lib/rental-pricing"
import { localDate } from "../../../../lib/waitlist"
import { BOOKING_MODULE } from "../../../../modules/booking"
import type BookingModuleService from "../../../../modules/booking/service"
import { zonedTimeToUtc } from "../../../../modules/booking/utils/slot"
import {
  addBookingToCartWorkflow,
  isVisitService,
  VISIT_ADDRESS_MESSAGE,
  VISIT_ADDRESS_MIN,
} from "../../../../workflows/add-booking-to-cart"
import { defaultTimezone } from "../../../../workflows/booking-resource"
import { releaseSeriesHoldsWorkflow } from "../../../../workflows/release-series-holds"
import type { PostPackageType } from "../validators"

// POST /store/booking/package { cart_id, variant_id, date, address?, notes? }
// (TASKS P3-30, kind H): an event package on its date. Every piece in the
// package's Metadata gets the first calendar with room; if any piece has
// none, nothing is added and the answer names them (`unavailable`). Then the
// package line (its price) and each piece ($0, its own booking) go into the
// cart together, all tagged with one package id; the cart hooks keep them
// whole until checkout, which confirms them together.
type Plan = {
  variant_id: string
  title: string
  resource_id: string
  starts_at?: string
  ends_at?: string
  start_date?: string
  end_date?: string
}

export const POST = async (req: MedusaRequest<PostPackageType>, res: MedusaResponse) => {
  const body = req.validatedBody
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const booking = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  const {
    data: [pkg],
  } = await query.graph({ entity: "product_variant", fields: ["id", "product.title", "product.metadata"], filters: { id: body.variant_id } })
  const pieces = packagePieces(pkg?.product?.metadata as Record<string, unknown> | null)
  if (!pkg || !pieces) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PACKAGE_NOT_MESSAGE)
  }
  if (!eventDateOk(body.date, localDate(new Date(), defaultTimezone()))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, PACKAGE_DATE_MESSAGE)
  }

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "sku",
      "title",
      "metadata",
      "product.title",
      "product.metadata",
      "booking_resources.id",
      "booking_resources.timezone",
      "booking_resources.is_active",
    ],
    filters: { sku: pieces.map((p) => p.sku) },
  })
  const plans: Plan[] = []
  const unavailable: string[] = []
  const address = (body.address ?? "").trim()
  for (const piece of pieces) {
    const v = variants.find((x) => x.sku === piece.sku)
    const title = v ? `${v.product?.title ?? ""}${v.title && v.title !== v.product?.title ? ` (${v.title})` : ""}` : piece.sku
    if (!v) {
      unavailable.push(title)
      continue
    }
    if (isVisitService(v.product) && address.length < VISIT_ADDRESS_MIN) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, VISIT_ADDRESS_MESSAGE)
    }
    const day = addDays(body.date, piece.day)
    const unit = rentalUnit(v.product)
    let found: Plan | null = null
    for (const r of (v.booking_resources ?? []).filter((x) => x?.is_active)) {
      let starts: Date, ends: Date, extra: Partial<Plan>
      if (piece.days) {
        if (!unit) break
        const end = unit === "day" ? addDays(day, piece.days - 1) : addDays(day, piece.days)
        const span = rentalSpan(unit, day, end)
        starts = zonedTimeToUtc(span.from, "00:00", r!.timezone)
        ends = zonedTimeToUtc(span.to, "00:00", r!.timezone)
        extra = { start_date: day, end_date: end }
      } else {
        const minutes = Number((v.metadata as Record<string, unknown> | null)?.duration_minutes) || 60
        starts = zonedTimeToUtc(day, piece.time!, r!.timezone)
        ends = new Date(starts.getTime() + minutes * 60_000)
        extra = { starts_at: starts.toISOString(), ends_at: ends.toISOString() }
      }
      const check = await booking.checkSlot({ resource_id: r!.id, starts_at: starts, ends_at: ends, ignore_cart_id: body.cart_id })
      if (check.available) {
        found = { variant_id: v.id, title, resource_id: r!.id, ...extra }
        break
      }
    }
    if (found) plans.push(found)
    else unavailable.push(title)
  }
  if (unavailable.length) {
    res.status(400).json({
      type: "not_allowed",
      message: `Not available on ${body.date}: ${unavailable.join(", ")}. Choose another date.`,
      unavailable,
    })
    return
  }

  const package_id = `bpkg_${randomUUID().replace(/-/g, "")}`
  const added: { booking_id?: string | null; line_item_id: string }[] = []
  try {
    await addToCartWorkflow(req.scope).run({
      input: {
        cart_id: body.cart_id,
        items: [{ variant_id: pkg.id, quantity: 1, metadata: { [PACKAGE_ITEM_KEY]: package_id, [PACKAGE_DATE_KEY]: body.date } }],
      },
    })
    const {
      data: [cart],
    } = await query.graph({ entity: "cart", fields: ["items.id", "items.metadata"], filters: { id: body.cart_id } })
    const head = (cart?.items ?? []).find(
      (i) => (i?.metadata as Record<string, unknown> | null)?.[PACKAGE_ITEM_KEY] === package_id
    )
    if (head) added.push({ line_item_id: head.id })
    for (const plan of plans) {
      const { result } = await addBookingToCartWorkflow(req.scope).run({
        input: {
          cart_id: body.cart_id,
          variant_id: plan.variant_id,
          resource_id: plan.resource_id,
          ...(plan.starts_at ? { starts_at: plan.starts_at, ends_at: plan.ends_at } : {}),
          ...(plan.start_date ? { start_date: plan.start_date, end_date: plan.end_date } : {}),
          ...(address ? { address } : {}),
          notes: (body.notes ?? "").trim() || `Event package: ${pkg.product?.title ?? ""}`,
          package_id,
        },
      })
      added.push({ booking_id: result.booking.id, line_item_id: result.line_item_id })
    }
  } catch (e) {
    if (added.length) {
      await releaseSeriesHoldsWorkflow(req.scope).run({ input: { cart_id: body.cart_id, added } })
    }
    throw e
  }
  res.json({ package_id, pieces: plans.map((p) => ({ title: p.title, starts_at: p.starts_at ?? null, start_date: p.start_date ?? null })) })
}
