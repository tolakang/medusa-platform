import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// Currencies a vendor may price in (bug 2026-11-25: a KHR price was offered,
// but no region sells in KHR, so the product could never be bought). Derived
// from the regions' currency_code (Region Module, read through Query). With no
// region at all (a fresh store), every currency is allowed: nothing sells yet.

export async function sellableCurrencies(container: MedusaContainer): Promise<string[]> {
  const { data: regions } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({ entity: "region", fields: ["currency_code"] })
  return [...new Set(regions.map((r) => r.currency_code.toLowerCase()))].sort()
}

export const currencyNotSoldMessage = (code: string, allowed: string[]) =>
  `No region sells in ${code.toUpperCase()}. Price it in ${allowed
    .map((c) => c.toUpperCase())
    .join(" or ")}.`

/** Refuses a price whose currency no region sells. */
export async function assertSellableCurrencies(container: MedusaContainer, codes: string[]) {
  const allowed = await sellableCurrencies(container)
  if (!allowed.length) {
    return
  }
  const bad = codes.map((c) => c.toLowerCase()).find((c) => !allowed.includes(c))
  if (bad) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, currencyNotSoldMessage(bad, allowed))
  }
}
