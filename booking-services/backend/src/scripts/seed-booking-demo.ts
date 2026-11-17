import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, ProductStatus } from "@medusajs/framework/utils"
import {
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { createBookingResourceWorkflow, defaultTimezone } from "../workflows/booking-resource"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

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
    kind: "B",
    name: "Visits at your place",
    handle: "home-visits",
    description: "We come to you: repairs, cleaning and installation.",
  },
  {
    kind: "C",
    name: "Trips",
    handle: "trips",
    description: "Moving, transfers and a driver for the day: from your pickup to your drop-off.",
  },
  {
    kind: "E",
    name: "Rentals",
    handle: "rentals",
    description: "Rent by the day or the night: tents, costumes, vehicles and rooms.",
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

  // ---- B. Visit at your place: a time, the address, the problem ------------
  // As an appointment (kind A) with a technician as the resource; the product
  // is marked metadata.booking_kind "B", so booking it asks for the address
  // and what needs doing (add-booking-to-cart, TASKS P3-20).
  if (await exists("air-conditioner-service")) {
    logger.info('Booking demo: "air-conditioner-service" already exists; skipped.')
  } else {
    const JOBS = [
      { title: "Cleaning", sku: "AC-CLEAN", minutes: 60, price: 15 },
      { title: "Repair visit", sku: "AC-REPAIR", minutes: 90, price: 20 },
    ]
    const {
      result: [job],
    } = await createProductOptionsWorkflow(container).run({
      input: { product_options: [{ title: "Job", values: JOBS.map((j) => j.title) }] },
    })
    const {
      result: [product],
    } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Air conditioner service",
            handle: "air-conditioner-service",
            description:
              "A technician comes to your home or office to clean or repair your air conditioner. Tell us the address and the problem when you book.",
            status: ProductStatus.PUBLISHED,
            metadata: { booking_kind: "B" },
            options: [{ id: job.id }],
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryIds.B],
            variants: JOBS.map((j) => ({
              title: j.title,
              sku: j.sku,
              manage_inventory: false,
              options: { Job: j.title },
              metadata: { duration_minutes: j.minutes },
              prices: [{ amount: j.price, currency_code: "usd" }],
            })),
          },
        ],
      },
    })
    // Monday to Saturday, 08:00-12:00 and 13:00-17:00 in the shop's zone.
    const schedules = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
      { weekday, start_time: "08:00", end_time: "12:00" },
      { weekday, start_time: "13:00", end_time: "17:00" },
    ])
    const { result: technician } = await createBookingResourceWorkflow(container).run({
      input: {
        name: "Vannak",
        type: "staff",
        timezone: defaultTimezone(),
        schedules,
        variant_ids: product.variants.map((v) => v.id),
      },
    })
    logger.info(`Booking demo: service "${product.title}" and technician ${technician.name} created.`)
  }

  // ---- C. Trip A → B: pickup, drop-off, a vehicle size (TASKS P3-21) -----
  // Two pricing modes (plan D12): a moving truck by the hour (variant price =
  // per hour, metadata.min_hours) and an airport transfer by zones (a price
  // table between areas). Vehicles are resources whose capacity is how many
  // of that size the shop has. Every day 06:00-22:00.
  const tripHours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: "06:00", end_time: "22:00" }))
  if (await exists("moving-truck")) {
    logger.info('Booking demo: "moving-truck" already exists; skipped.')
  } else {
    const TRUCKS = [
      { title: "Small truck", sku: "TRUCK-S", hourly: 15, min: 2, fleet: 2, name: "Small trucks" },
      { title: "Large truck", sku: "TRUCK-L", hourly: 25, min: 3, fleet: 1, name: "Large truck" },
    ]
    const {
      result: [size],
    } = await createProductOptionsWorkflow(container).run({
      input: { product_options: [{ title: "Truck size", values: TRUCKS.map((t) => t.title) }] },
    })
    const {
      result: [product],
    } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Moving truck",
            handle: "moving-truck",
            description: "A truck with a driver and two helpers to move your home or office. Priced by the hour.",
            status: ProductStatus.PUBLISHED,
            metadata: { booking_kind: "C", trip_pricing: "hours" },
            options: [{ id: size.id }],
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryIds.C],
            variants: TRUCKS.map((t) => ({
              title: t.title,
              sku: t.sku,
              manage_inventory: false,
              options: { "Truck size": t.title },
              // The slot length the picker starts from; the customer picks the hours.
              metadata: { duration_minutes: t.min * 60, min_hours: t.min },
              prices: [{ amount: t.hourly, currency_code: "usd" }],
            })),
          },
        ],
      },
    })
    for (const t of TRUCKS) {
      await createBookingResourceWorkflow(container).run({
        input: {
          name: t.name,
          type: "equipment",
          capacity: t.fleet,
          timezone: defaultTimezone(),
          schedules: tripHours,
          variant_ids: [product.variants.find((v) => v.title === t.title)!.id],
        },
      })
    }
    logger.info(`Booking demo: service "${product.title}" (by the hour) created.`)
  }

  if (await exists("airport-transfer")) {
    logger.info('Booking demo: "airport-transfer" already exists; skipped.')
  } else {
    const CARS = [
      { title: "Car (up to 3)", sku: "TRANSFER-CAR", fleet: 3, name: "Cars", factor: 1 },
      { title: "Van (up to 10)", sku: "TRANSFER-VAN", fleet: 1, name: "Van", factor: 2 },
    ]
    const {
      result: [vehicle],
    } = await createProductOptionsWorkflow(container).run({
      input: { product_options: [{ title: "Vehicle", values: CARS.map((c) => c.title) }] },
    })
    const {
      result: [product],
    } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Airport transfer",
            handle: "airport-transfer",
            description: "A driver takes you between the airport, town and the temples. The price is set by the two areas.",
            status: ProductStatus.PUBLISHED,
            metadata: { booking_kind: "C", trip_pricing: "zones" },
            options: [{ id: vehicle.id }],
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryIds.C],
            variants: CARS.map((c) => ({
              title: c.title,
              sku: c.sku,
              manage_inventory: false,
              options: { Vehicle: c.title },
              metadata: { duration_minutes: 60 },
              // Shown as "from"; the zone table sets the real price.
              prices: [{ amount: 12 * c.factor, currency_code: "usd" }],
            })),
          },
        ],
      },
    })
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const zoneNames = ["Siem Reap town", "Airport", "Angkor temples"]
    const zones = new Map<string, string>()
    for (const [rank, name] of zoneNames.entries()) {
      const [found] = await booking.listBookingZones({ name })
      zones.set(name, (found ?? (await booking.createBookingZones({ name, rank }))).id)
    }
    const TRIPS = [
      { from: "Siem Reap town", to: "Airport", amount: 12, minutes: 60 },
      { from: "Siem Reap town", to: "Angkor temples", amount: 10, minutes: 60 },
      { from: "Airport", to: "Angkor temples", amount: 18, minutes: 90 },
    ]
    for (const c of CARS) {
      const variant = product.variants.find((v) => v.title === c.title)!
      await booking.createBookingZonePrices(
        TRIPS.map((t) => ({
          variant_id: variant.id,
          from_zone_id: zones.get(t.from)!,
          to_zone_id: zones.get(t.to)!,
          amount: t.amount * c.factor,
          currency_code: "usd",
          minutes: t.minutes,
        }))
      )
      await createBookingResourceWorkflow(container).run({
        input: { name: c.name, type: "equipment", capacity: c.fleet, timezone: defaultTimezone(), schedules: tripHours, variant_ids: [variant.id] },
      })
    }
    logger.info(`Booking demo: service "${product.title}" (by zones: ${zoneNames.join(", ")}) created.`)
  }

  // ---- E. Rental by dates (TASKS P3-22) -----------------------------------
  // The variant's price is per day or night (product metadata.rental_unit);
  // each size is an item (a resource booked by whole days) whose capacity is
  // how many of it the shop has.
  const RENTALS = [
    {
      handle: "wedding-tent",
      title: "Wedding tent",
      description: "A tent with tables and chairs, set up at your place. Rented by the day, from the start date to the end date.",
      unit: "day",
      option: "Tent size",
      sizes: [
        { title: "20 guests", sku: "TENT-20", price: 35, count: 3 },
        { title: "50 guests", sku: "TENT-50", price: 60, count: 2 },
      ],
    },
    {
      handle: "guesthouse-room",
      title: "Guesthouse room",
      description: "A quiet room in our guesthouse. Priced per night, from check-in to check-out.",
      unit: "night",
      option: "Room",
      sizes: [
        { title: "Double room", sku: "ROOM-DOUBLE", price: 25, count: 4 },
        { title: "Family room", sku: "ROOM-FAMILY", price: 40, count: 2 },
      ],
    },
  ]
  for (const r of RENTALS) {
    if (await exists(r.handle)) {
      logger.info(`Booking demo: "${r.handle}" already exists; skipped.`)
      continue
    }
    const {
      result: [option],
    } = await createProductOptionsWorkflow(container).run({
      input: { product_options: [{ title: r.option, values: r.sizes.map((x) => x.title) }] },
    })
    const {
      result: [product],
    } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: r.title,
            handle: r.handle,
            description: r.description,
            status: ProductStatus.PUBLISHED,
            metadata: { booking_kind: "E", rental_unit: r.unit },
            options: [{ id: option.id }],
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryIds.E],
            variants: r.sizes.map((x) => ({
              title: x.title,
              sku: x.sku,
              manage_inventory: false,
              options: { [r.option]: x.title },
              // The storefront reads a service by its length; a day or a night.
              metadata: { duration_minutes: 1440 },
              prices: [{ amount: x.price, currency_code: "usd" }],
            })),
          },
        ],
      },
    })
    for (const x of r.sizes) {
      await createBookingResourceWorkflow(container).run({
        input: {
          name: `${r.title}: ${x.title}`,
          type: "equipment",
          capacity: x.count,
          timezone: defaultTimezone(),
          whole_days: true,
          variant_ids: [product.variants.find((v) => v.title === x.title)!.id],
        },
      })
    }
    logger.info(`Booking demo: rental "${r.title}" (per ${r.unit}) created.`)
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
