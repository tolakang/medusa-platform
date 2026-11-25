export type PriceTier = {
  min_quantity: number;
  max_quantity: number | null;
  amount: number;
};

/** Merges break points with the same amount into ranges. */
export function toTiers(byQuantity?: Map<number, number>): PriceTier[] {
  if (!byQuantity?.size) return [];
  const points = [...byQuantity.entries()].sort((a, b) => a[0] - b[0]);
  const tiers: PriceTier[] = [];
  for (const [quantity, amount] of points) {
    const last = tiers[tiers.length - 1];
    if (last && last.amount === amount) continue;
    if (last) last.max_quantity = quantity - 1;
    tiers.push({ min_quantity: quantity, max_quantity: null, amount });
  }
  return tiers;
}
