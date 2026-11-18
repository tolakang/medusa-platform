import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Free slots for a service on a local date (TASKS P3-10), from every active
// resource that offers it, or one of them. Shared by GET /store/booking/slots
// and the waitlist job (P3-29), so both see the same times.
export async function freeSlotsForVariant(
  scope: MedusaContainer,
  input: { variant_id: string; date: string; resource_id?: string; duration_minutes?: number }
) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [variant],
  } = await query.graph({
    entity: "product_variant",
    fields: ["id", "metadata", "booking_resources.id", "booking_resources.name", "booking_resources.timezone"],
    filters: { id: input.variant_id },
  })
  if (!variant) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${input.variant_id} was not found.`)
  }
  // A service variant's length (P3-12), unless the caller asks for another.
  const fromVariant = Number((variant.metadata as Record<string, unknown> | null)?.duration_minutes)
  const duration_minutes =
    input.duration_minutes ?? (Number.isInteger(fromVariant) && fromVariant >= 5 && fromVariant <= 720 ? fromVariant : 60)
  const offering = (variant.booking_resources ?? []).filter(Boolean)
  const resources = input.resource_id ? offering.filter((r) => r!.id === input.resource_id) : offering
  if (input.resource_id && !resources.length) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This resource doesn't offer this service.")
  }
  const free = await scope.resolve<BookingModuleService>(BOOKING_MODULE).listFreeSlots({
    resource_ids: resources.map((r) => r!.id),
    date: input.date,
    duration_minutes,
  })
  const byId = new Map(resources.map((r) => [r!.id, r!]))
  return {
    duration_minutes,
    slots: free.map((s) => ({
      resource_id: s.resource_id,
      resource_name: byId.get(s.resource_id)?.name,
      timezone: byId.get(s.resource_id)?.timezone,
      starts_at: s.starts_at.toISOString(),
      ends_at: s.ends_at.toISOString(),
      remaining: s.remaining,
    })),
  }
}
