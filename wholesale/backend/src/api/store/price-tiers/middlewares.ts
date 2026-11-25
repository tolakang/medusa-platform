import { authenticate, validateAndTransformQuery } from "@medusajs/framework";
import { MiddlewareRoute } from "@medusajs/medusa";
import { StoreGetPriceTiersParams } from "./validators";

export const storePriceTiersMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/store/price-tiers",
    middlewares: [
      // As /store/products: a signed-in buyer gets their group's tiers, a
      // guest the base price (MEDUSA_SKILL "Store prices").
      authenticate("customer", ["session", "bearer"], {
        allowUnauthenticated: true,
      }),
      validateAndTransformQuery(StoreGetPriceTiersParams, {}),
    ],
  },
];
