// Line items grouped by the vendor that sells them ("Sold by <shop>"), in the
// order each vendor first appears. Items with no known vendor go last under
// `vendor: null`.
export type VendorRef = { handle: string; name: string }

/** The distinct product ids of a cart's or order's items. */
export function productIdsOf(
  items: { product_id?: string | null }[] | null | undefined
): string[] {
  return Array.from(
    new Set((items ?? []).map((i) => i.product_id).filter((id): id is string => !!id))
  )
}

export function groupByVendor<T extends { product_id?: string | null }>(
  items: T[],
  vendors: Record<string, VendorRef>
): { vendor: VendorRef | null; items: T[] }[] {
  const groups = new Map<string, { vendor: VendorRef | null; items: T[] }>()
  for (const item of items) {
    const vendor = (item.product_id && vendors[item.product_id]) || null
    const key = vendor?.handle ?? ""
    if (!groups.has(key)) {
      groups.set(key, { vendor, items: [] })
    }
    groups.get(key)!.items.push(item)
  }
  const list = Array.from(groups.values())
  return [...list.filter((g) => g.vendor), ...list.filter((g) => !g.vendor)]
}
