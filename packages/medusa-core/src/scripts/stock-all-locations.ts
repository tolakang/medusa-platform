import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Gives every inventory item a level at every stock location where it has
 * none, with `quantity` in stock. Used by the seeds so the starter products
 * can be sold from the Cambodia location (POS registers) as well as the
 * starter "European Warehouse" (role tests 2026-11-25). Existing levels are
 * left alone, so re-running changes nothing. Same workflow as the starter's
 * own inventory step (seed-initial-data.ts).
 *
 * `onlyItem` limits it to some items (for example the demo products).
 */
export async function stockAllLocations(
  container: MedusaContainer,
  quantity: number,
  onlyItem?: (itemId: string) => boolean
): Promise<number> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id"],
  })
  const { data: items } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "location_levels.location_id"],
  })

  const levels: {
    inventory_item_id: string
    location_id: string
    stocked_quantity: number
  }[] = []
  for (const item of items) {
    if (onlyItem && !onlyItem(item.id as string)) {
      continue
    }
    const has = new Set(
      (item.location_levels ?? []).map((level) => level?.location_id)
    )
    for (const location of locations) {
      if (!has.has(location.id)) {
        levels.push({
          inventory_item_id: item.id as string,
          location_id: location.id as string,
          stocked_quantity: quantity,
        })
      }
    }
  }

  if (levels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: levels },
    })
  }
  return levels.length
}
