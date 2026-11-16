import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, ProductStatus } from "@medusajs/framework/utils"
import {
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { createBookingResourceWorkflow, defaultTimezone } from "../workflows/booking-resource"

// Booking-only demo data (TASKS P3-12, P3-19; plan §9.3 "Booking-only shop"):
// one example per booking kind, each in its own product category, so the
// shop's home page and menu can list services by kind. `pnpm seed` first
// (Cambodia region, USD), then `pnpm seed:booking-demo`. No demo goods, no
// Europe region or warehouse (the starter's seed:initial isn't run for this
// shop). Safe to re-run: each kind is created only if its service is missing,
// so a shop seeded before P3-19 gets the new kinds on the next run.
//
// A service is a product WITHOUT a shipping profile whose variants have
// manage_inventory: false, so its line items don't require shipping
// (docs "Configure Selling Products": no inventory item → the product's
// shipping profile decides; core-flows prepare-line-item-data). Each variant
// has metadata.duration_minutes, the slot length the storefront asks for
// (GET /store/booking/slots defaults to it), and is offered by the booking
// resources linked to it (resource ↔ variant link).

// One category per booking kind (plan §9.3 table). `rank` orders the home
// page and the menu.
export const BOOKING_KIND_CATEGORIES = [
  {
    kind: "A",
    name: "Appointments",
    handle: "appointments",
    description: "Book a time with a person, a room or a court.",
  },
  {
    kind: "G",
    name: "Table reservations",
    handle: "table-reservations",
    description: "Reserve a table for your group.",
  },
] as const

type Kind = (typeof BOOKING_KIND_CATEGORIES)[number]["kind"]

export default async function seedBookingDemo({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [store],
  } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
  if (!store?.default_sales_channel_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "The store has no default sales channel. Run `pnpm seed` first.")
  }
  const salesChannelId = store.default_sales_channel_id
  const categoryIds = await ensureKindCategories(container)

  const exists = async (handle: string) =>
    (await query.graph({ entity: "product", fields: ["id"], filters: { handle } })).data.length > 0

  // ---- A. Appointment: a haircut with one stylist -------------------------
  if (await exists("haircut")) {
    logger.info('Booking demo: "haircut" already exists; skipped.')
  } else {
    const {
      result: [length],
    } = await createProductOptionsWorkflow(container).run({
      input: { product_options: [{ title: "Length", values: ["30 min", "60 min"] }] },
    })
    const {
      result: [product],
    } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Haircut",
            handle: "haircut",
            description: "Cut and style with one of our stylists. Pick a time that suits you.",
            status: ProductStatus.PUBLISHED,
            // No shipping_profile_id: a service isn't shipped.
            options: [{ id: length.id }],
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryIds.A],
            variants: [
              {
                title: "30 min",
                sku: "HAIRCUT-30",
                manage_inventory: false,
                options: { Length: "30 min" },
                metadata: { duration_minutes: 30 },
                prices: [{ amount: 8, currency_code: "usd" }],
              },
              {
                title: "60 min",
                sku: "HAIRCUT-60",
                manage_inventory: false,
                options: { Length: "60 min" },
                metadata: { duration_minutes: 60 },
                prices: [{ amount: 15, currency_code: "usd" }],
              },
            ],
          },
        ],
      },
    })
    // Monday to Saturday, 09:00-12:00 and 13:00-17:00 in the shop's zone.
    const schedules = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
      { weekday, start_time: "09:00", end_time: "12:00" },
      { weekday, start_time: "13:00", end_time: "17:00" },
    ])
    const { result: stylist } = await createBookingResourceWorkflow(container).run({
      input: {
        name: "Sophea",
        type: "staff",
        timezone: defaultTimezone(),
        schedules,
        variant_ids: product.variants.map((v) => v.id),
      },
    })
    logger.info(`Booking demo: service "${product.title}" and stylist ${stylist.name} (${stylist.timezone}) created.`)
  }

  // ---- G. Table reservation: a time and a party size ----------------------
  // As an appointment (kind A) whose variants are party sizes: each size is
  // offered by its own table resource, whose capacity is the number of such
  // tables, so a booking takes one table of the right size (plan §9.3: one
  // booking takes one place of the resource's capacity). The price is a small
  // deposit; a free reservation would be a $0 variant.
  if (await exists("table-reservation")) {
    logger.info('Booking demo: "table-reservation" already exists; skipped.')
  } else {
    const SIZES = [
      { people: 2, tables: 4, name: "Tables for 2" },
      { people: 4, tables: 3, name: "Tables for 4" },
      { people: 6, tables: 1, name: "Table for 6" },
    ]
    const label = (people: number) => `${people} people`
    const {
      result: [partySize],
    } = await createProductOptionsWorkflow(container).run({
      input: { product_options: [{ title: "Party size", values: SIZES.map((s) => label(s.people)) }] },
    })
    const {
      result: [product],
    } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Table reservation",
            handle: "table-reservation",
            description:
              "Reserve a table for lunch or dinner. Pick your party size and a time; a small deposit holds the table for 90 minutes.",
            status: ProductStatus.PUBLISHED,
            options: [{ id: partySize.id }],
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryIds.G],
            variants: SIZES.map((s) => ({
              title: label(s.people),
              sku: `TABLE-${s.people}`,
              manage_inventory: false,
              options: { "Party size": label(s.people) },
              metadata: { duration_minutes: 90, party_size: s.people },
              prices: [{ amount: 5, currency_code: "usd" }],
            })),
          },
        ],
      },
    })
    // Every day, lunch 11:00-14:00 and dinner 17:00-22:00 in the shop's zone.
    const schedules = [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [
      { weekday, start_time: "11:00", end_time: "14:00" },
      { weekday, start_time: "17:00", end_time: "22:00" },
    ])
    for (const size of SIZES) {
      const variant = product.variants.find((v) => v.title === label(size.people))!
      await createBookingResourceWorkflow(container).run({
        input: {
          name: size.name,
          type: "venue",
          capacity: size.tables,
          timezone: defaultTimezone(),
          schedules,
          variant_ids: [variant.id],
        },
      })
    }
    logger.info(
      `Booking demo: service "${product.title}" with ${SIZES.map((s) => `${s.name} (${s.tables})`).join(", ")} created.`
    )
  }
}

// The kind categories, created when missing (by handle). Returns their ids.
async function ensureKindCategories(container: MedusaContainer): Promise<Record<Kind, string>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const handles = BOOKING_KIND_CATEGORIES.map((c) => c.handle)
  const { data: found } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
    filters: { handle: [...handles] },
  })
  const missing = BOOKING_KIND_CATEGORIES.filter((c) => !found.some((f) => f.handle === c.handle))
  let created: { id: string; handle: string }[] = []
  if (missing.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missing.map((c) => ({
          name: c.name,
          handle: c.handle,
          description: c.description,
          is_active: true,
          rank: BOOKING_KIND_CATEGORIES.findIndex((k) => k.handle === c.handle),
          metadata: { booking_kind: c.kind },
        })),
      },
    })
    created = result.map((c) => ({ id: c.id, handle: c.handle }))
  }
  const all = [...found, ...created]
  return Object.fromEntries(
    BOOKING_KIND_CATEGORIES.map((c) => [c.kind, all.find((f) => f.handle === c.handle)!.id])
  ) as Record<Kind, string>
}
