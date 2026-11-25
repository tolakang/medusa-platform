import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { IPricingModuleService } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  QueryContext,
} from "@medusajs/framework/utils";
import { toTiers } from "../../../utils/price-tiers";
import { StoreGetPriceTiersParamsType } from "./validators";

// Polish 2026-11-25: the quantity price breaks a buyer gets for a variant
// ("1-9 €47.20 / 10+ €44.25"). /store/products has no quantity in its
// pricing context (MEDUSA_SKILL "Quantity tiers"), so this route asks the
// calculated price once per break point:
// - the context is the one the store product route builds (region,
//   currency, `customer.groups[].id`; @medusajs/medusa
//   dist/api/utils/middlewares/products/set-pricing-context.js), passed with
//   QueryContext as in MEDUSA_SKILL "Variant price outside the store routes";
// - plus `quantity`, which the pricing module matches against each price's
//   min_quantity / max_quantity (@medusajs/types pricing/common/price-set.d.ts
//   PricingContext; @medusajs/pricing dist/repositories/pricing.js).
// So the tiers are exactly what the cart will charge, price-list rules and
// "sale" list semantics included.
export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, StoreGetPriceTiersParamsType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { region_id, variant_id: variantIds } =
    req.validatedQuery as StoreGetPriceTiersParamsType;

  const {
    data: [region],
  } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
    filters: { id: region_id },
  });
  if (!region) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Region not found");
  }

  const pricingContext: Record<string, unknown> = {
    region_id: region.id,
    currency_code: region.currency_code,
  };
  const customerId = req.auth_context?.actor_id;
  if (customerId) {
    const {
      data: [customer],
    } = await query.graph({
      entity: "customer",
      fields: ["groups.id"],
      filters: { id: customerId },
    });
    pricingContext.customer = {
      groups: (customer?.groups ?? []).flatMap((g) => (g?.id ? [{ id: g.id }] : [])),
    };
  }

  // Break points: 1, every min_quantity and the quantity after every
  // max_quantity of the variant's prices in this currency, price-list prices
  // included. `price_set.prices` in query.graph returned only the base
  // prices (test run 2026-11-25), so the prices come from the pricing
  // module's listPrices (@medusajs/types pricing/service.d.ts, filters
  // price_set_id / currency_code in common/price.d.ts).
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "price_set.id"],
    filters: { id: variantIds },
  });
  const setIds = variants
    .map((v) => v.price_set?.id)
    .filter((id): id is string => !!id);
  const prices = setIds.length
    ? await req.scope
        .resolve<IPricingModuleService>(Modules.PRICING)
        .listPrices(
          { price_set_id: setIds, currency_code: region.currency_code },
          { select: ["price_set_id", "min_quantity", "max_quantity"] }
        )
    : [];

  const breaks = new Map<string, Set<number>>();
  for (const variant of variants) {
    const points = new Set<number>([1]);
    for (const price of prices) {
      if (price.price_set_id !== variant.price_set?.id) continue;
      const min = Number(price.min_quantity);
      const max = Number(price.max_quantity);
      if (price.min_quantity != null && min > 1) points.add(Math.ceil(min));
      if (price.max_quantity != null && max >= 1) points.add(Math.floor(max) + 1);
    }
    breaks.set(variant.id, points);
  }

  const quantities = [
    ...new Set([...breaks.values()].flatMap((set) => [...set])),
  ].sort((a, b) => a - b);

  // amounts[variant][quantity]
  const amounts = new Map<string, Map<number, number>>();
  for (const quantity of quantities) {
    const ids = variants
      .filter((v) => breaks.get(v.id)?.has(quantity))
      .map((v) => v.id);
    if (!ids.length) continue;
    const { data: priced } = await query.graph({
      entity: "product_variant",
      fields: ["id", "calculated_price.calculated_amount"],
      filters: { id: ids },
      context: {
        calculated_price: QueryContext({ ...pricingContext, quantity }),
      },
    });
    for (const row of priced as unknown as {
      id: string;
      calculated_price?: { calculated_amount?: number | null } | null;
    }[]) {
      const amount = row.calculated_price?.calculated_amount;
      if (amount == null) continue;
      if (!amounts.has(row.id)) amounts.set(row.id, new Map());
      amounts.get(row.id)!.set(quantity, Number(amount));
    }
  }

  const price_tiers = variants.map((variant) => ({
    variant_id: variant.id,
    currency_code: region.currency_code,
    tiers: toTiers(amounts.get(variant.id)),
  }));

  res.json({ price_tiers });
};
