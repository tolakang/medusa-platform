import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, ProductStatus } from "@medusajs/framework/utils"
import {
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  updateInventoryItemsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { createBookingResourceWorkflow, defaultTimezone } from "../workflows/booking-resource"
import { zonedTimeToUtc } from "../modules/booking/utils/slot"
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
    kind: "D",
    name: "Departures",
    handle: "departures",
    description: "Buses, boats and tours that leave at set times. Book your seats.",
  },
  {
    kind: "E",
    name: "Rentals",
    handle: "rentals",
    description: "Rent by the day or the night: tents, costumes, vehicles and rooms.",
  },
  {
    kind: "F",
    name: "Events",
    handle: "events",
    description: "Shows and workshops on set dates. Choose a section and how many tickets.",
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

  // ---- D. Scheduled departure (TASKS P3-23) -------------------------------
  // Each route is a variant with its length; its vehicle is a resource whose
  // weekly hours are its departures, each window exactly one trip long, and
  // whose capacity is its seats. A booking takes several seats (quantity).
  const everyDay = (windows: [string, string][]) =>
    [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => windows.map(([start_time, end_time]) => ({ weekday, start_time, end_time })))
  const DEPARTURES = [
    {
      handle: "bus-siem-reap-phnom-penh",
      title: "Bus Siem Reap to Phnom Penh",
      description: "An air-conditioned bus, about 6 hours. Two departures a day. The price is per seat.",
      max_seats: 10,
      routes: [
        {
          title: "Siem Reap → Phnom Penh",
          sku: "BUS-SR-PP",
          minutes: 360,
          price: 12,
          vehicle: "Bus to Phnom Penh",
          seats: 40,
          windows: [["07:00", "13:00"], ["13:30", "19:30"]] as [string, string][],
        },
      ],
    },
    {
      handle: "angkor-sunrise-tour",
      title: "Angkor sunrise tour",
      description: "Sunrise at Angkor Wat, then Bayon and Ta Prohm with a guide, back for lunch. The price is per seat.",
      max_seats: 8,
      routes: [
        {
          title: "Sunrise tour (8 hours)",
          sku: "TOUR-SUNRISE",
          minutes: 480,
          price: 25,
          vehicle: "Tour van",
          seats: 12,
          windows: [["04:30", "12:30"]] as [string, string][],
        },
      ],
    },
  ]
  for (const d of DEPARTURES) {
    if (await exists(d.handle)) {
      logger.info(`Booking demo: "${d.handle}" already exists; skipped.`)
      continue
    }
    const {
      result: [route],
    } = await createProductOptionsWorkflow(container).run({
      input: { product_options: [{ title: `${d.title} route`, values: d.routes.map((r) => r.title) }] },
    })
    const {
      result: [product],
    } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: d.title,
            handle: d.handle,
            description: d.description,
            status: ProductStatus.PUBLISHED,
            metadata: { booking_kind: "D", max_seats: d.max_seats },
            options: [{ id: route.id }],
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryIds.D],
            variants: d.routes.map((r) => ({
              title: r.title,
              sku: r.sku,
              manage_inventory: false,
              options: { [`${d.title} route`]: r.title },
              metadata: { duration_minutes: r.minutes },
              prices: [{ amount: r.price, currency_code: "usd" }],
            })),
          },
        ],
      },
    })
    for (const r of d.routes) {
      await createBookingResourceWorkflow(container).run({
        input: {
          name: r.vehicle,
          type: "equipment",
          capacity: r.seats,
          timezone: defaultTimezone(),
          schedules: everyDay(r.windows),
          variant_ids: [product.variants.find((v) => v.title === r.title)!.id],
        },
      })
    }
    logger.info(`Booking demo: departures "${d.title}" created.`)
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

  // ---- F. Event tickets by section (TASKS P3-24) --------------------------
  // As Medusa's Ticket Booking recipe, by section (owner, 2026-11-17): each
  // date and section is a variant whose inventory item holds that section's
  // seats (shipping off), so Medusa itself stops overselling; tickets with
  // codes are issued when the order is placed.
  if (await exists("apsara-dance-show")) {
    logger.info('Booking demo: "apsara-dance-show" already exists; skipped.')
  } else {
    // The next two Saturdays at least a week away, 19:00 in the shop's zone.
    const saturdays = [0, 7].map((plus) => {
      const d = new Date(Date.now() + 7 * 86_400_000)
      d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7) + plus)
      return d.toISOString().slice(0, 10)
    })
    const label = (date: string) =>
      new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) + " 19:00"
    const SECTIONS = [
      { title: "Standard", price: 15, seats: 60 },
      { title: "VIP", price: 30, seats: 20 },
    ]
    const {
      data: [location],
    } = await query.graph({ entity: "stock_location", fields: ["id"] })
    if (!location) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "No stock location. Run `pnpm seed` first.")
    }
    const options = await createProductOptionsWorkflow(container).run({
      input: {
        product_options: [
          { title: "Show date", values: saturdays.map(label) },
          { title: "Section", values: SECTIONS.map((x) => x.title) },
        ],
      },
    })
    const [dateOption, sectionOption] = options.result
    const {
      result: [product],
    } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Apsara dance show",
            handle: "apsara-dance-show",
            description: "Classical Khmer dance with live music, about 90 minutes. Pick a date, a section and how many tickets.",
            status: ProductStatus.PUBLISHED,
            metadata: { booking_kind: "F" },
            options: [{ id: dateOption.id }, { id: sectionOption.id }],
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryIds.F],
            variants: saturdays.flatMap((date) =>
              SECTIONS.map((x) => ({
                title: `${label(date)} · ${x.title}`,
                sku: `APSARA-${date}-${x.title.toUpperCase()}`,
                manage_inventory: true,
                options: { "Show date": label(date), Section: x.title },
                metadata: { event_starts_at: zonedTimeToUtc(date, "19:00", defaultTimezone()).toISOString() },
                prices: [{ amount: x.price, currency_code: "usd" }],
              }))
            ),
          },
        ],
      },
    })
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "title", "inventory_items.inventory_item_id"],
      filters: { product_id: product.id },
    })
    const items = variants.map((v) => ({
      id: (v.inventory_items ?? [])[0]!.inventory_item_id as string,
      seats: SECTIONS.find((x) => v.title.endsWith(x.title))!.seats,
    }))
    // A ticket isn't shipped.
    await updateInventoryItemsWorkflow(container).run({
      input: { updates: items.map((i) => ({ id: i.id, requires_shipping: false })) },
    })
    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: items.map((i) => ({ inventory_item_id: i.id, location_id: location.id, stocked_quantity: i.seats })),
      },
    })
    logger.info(`Booking demo: event "${product.title}" on ${saturdays.join(", ")} created.`)
  }

  // ---- Extras on a booking (TASKS P3-25) ----------------------------------
  // Products marked metadata.booking_extra (no shipping, per unit); the
  // moving truck offers them through its metadata.extras.
  const EXTRAS = [
    { handle: "packing-boxes", title: "Packing boxes", description: "Strong cardboard boxes, delivered with the truck.", price: 2 },
    { handle: "extra-helper", title: "Extra helper", description: "One more person to carry, for the whole booking.", price: 10 },
    { handle: "moving-insurance", title: "Moving insurance", description: "Covers breakage during the move, up to $500.", price: 8 },
  ]
  for (const x of EXTRAS) {
    if (await exists(x.handle)) {
      continue
    }
    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: x.title,
            handle: x.handle,
            description: x.description,
            status: ProductStatus.PUBLISHED,
            metadata: { booking_extra: true },
            options: [{ title: `${x.title} option`, values: ["Each"] }],
            sales_channels: [{ id: salesChannelId }],
            variants: [
              {
                title: "Each",
                sku: `EXTRA-${x.handle.toUpperCase()}`,
                manage_inventory: false,
                options: { [`${x.title} option`]: "Each" },
                prices: [{ amount: x.price, currency_code: "usd" }],
              },
            ],
          },
        ],
      },
    })
  }
  const {
    data: [truck],
  } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { handle: "moving-truck" } })
  const extraHandles = EXTRAS.map((x) => x.handle).join(",")
  if (truck && (truck.metadata as Record<string, unknown> | null)?.extras !== extraHandles) {
    await updateProductsWorkflow(container).run({
      input: { selector: { id: truck.id }, update: { metadata: { ...(truck.metadata ?? {}), extras: extraHandles } } },
    })
  }
  logger.info(`Booking demo: extras ${extraHandles} offered with the moving truck.`)

  // ---- Deposits (TASKS P3-26): pay part now, the rest at the shop ---------
  const DEPOSITS: Record<string, number> = { "moving-truck": 30, "wedding-tent": 50 }
  for (const [handle, percent] of Object.entries(DEPOSITS)) {
    const {
      data: [product],
    } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { handle } })
    const meta = (product?.metadata ?? {}) as Record<string, unknown>
    if (product && meta.deposit_percent !== percent) {
      await updateProductsWorkflow(container).run({
        input: { selector: { id: product.id }, update: { metadata: { ...meta, deposit_percent: percent } } },
      })
    }
  }
  logger.info("Booking demo: deposits 30% on the moving truck, 50% on the wedding tent.")

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

  // ---- Quote first (TASKS P3-27): priced on request ------------------------
  // metadata.quote_only: the customer describes the job and staff send a
  // price, a crew and a time; the accepted quote is booked at that price. The
  // variant price is 0 and the storefront shows "Price on quote".
  if (await exists("full-house-move")) {
    logger.info('Booking demo: "full-house-move" already exists; skipped.')
  } else {
    const {
      result: [move],
    } = await createProductOptionsWorkflow(container).run({
      input: { product_options: [{ title: "Move", values: ["Full house move"] }] },
    })
    const {
      result: [product],
    } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Full house move",
            handle: "full-house-move",
            description:
              "A crew packs, carries and moves your whole home. Every move is different: tell us what you have and where, and we send you a price and a time.",
            status: ProductStatus.PUBLISHED,
            metadata: { quote_only: true },
            options: [{ id: move.id }],
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryIds.A],
            variants: [
              {
                title: "Full house move",
                sku: "MOVE-FULL",
                manage_inventory: false,
                options: { Move: "Full house move" },
                metadata: { duration_minutes: 240 },
                prices: [{ amount: 0, currency_code: "usd" }],
              },
            ],
          },
        ],
      },
    })
    const { result: crew } = await createBookingResourceWorkflow(container).run({
      input: {
        name: "Moving crew",
        type: "staff",
        timezone: defaultTimezone(),
        schedules: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: "07:00", end_time: "18:00" })),
        variant_ids: product.variants.map((v) => v.id),
      },
    })
    logger.info(`Booking demo: quote-only service "${product.title}" and ${crew.name} created.`)
  }

  // ---- Pass (TASKS P3-29): credits for a service, bought like a product ---
  // No shipping profile (nothing is shipped). Metadata pass_credits /
  // pass_valid_days / pass_for: 5 haircuts within 180 days.
  if (await exists("haircut-5-pack")) {
    logger.info('Booking demo: "haircut-5-pack" already exists; skipped.')
  } else {
    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Haircut 5-pack",
            handle: "haircut-5-pack",
            description: "Five haircuts for the price of four, to use within 180 days. Book each one with your pass.",
            status: ProductStatus.PUBLISHED,
            metadata: { pass_credits: 5, pass_valid_days: 180, pass_for: ["haircut"] },
            options: [{ title: "Pass", values: ["5 haircuts"] }],
            sales_channels: [{ id: salesChannelId }],
            variants: [
              {
                title: "5 haircuts",
                sku: "PASS-HAIRCUT-5",
                manage_inventory: false,
                options: { Pass: "5 haircuts" },
                prices: [{ amount: 32, currency_code: "usd" }],
              },
            ],
          },
        ],
      },
    })
    logger.info('Booking demo: pass "Haircut 5-pack" created.')
  }

  // ---- H. Event package (TASKS P3-30): pieces booked together ------------
  // Metadata package_items lists the pieces by variant SKU: a time on the
  // event day, or whole days of a rental. The package's price is the whole
  // price; the pieces go in the cart at $0. No shipping profile.
  if (await exists("small-wedding")) {
    logger.info('Booking demo: "small-wedding" already exists; skipped.')
  } else {
    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Small wedding",
            handle: "small-wedding",
            description:
              "Hair for the bride in the morning, the 50-guest tent for the day and a table for six in the evening, booked together on your date.",
            status: ProductStatus.PUBLISHED,
            metadata: {
              package_items: [
                { sku: "HAIRCUT-60", day: 0, time: "09:00" },
                { sku: "TENT-50", day: 0, days: 1 },
                { sku: "TABLE-6", day: 0, time: "18:00" },
              ],
            },
            options: [{ title: "Package", values: ["Small wedding"] }],
            sales_channels: [{ id: salesChannelId }],
            variants: [
              {
                title: "Small wedding",
                sku: "PACKAGE-WEDDING-S",
                manage_inventory: false,
                options: { Package: "Small wedding" },
                prices: [{ amount: 150, currency_code: "usd" }],
              },
            ],
          },
        ],
      },
    })
    logger.info('Booking demo: package "Small wedding" created.')
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
