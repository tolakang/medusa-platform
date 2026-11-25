import { z } from "@medusajs/framework/zod";

export type StoreGetPriceTiersParamsType = z.infer<
  typeof StoreGetPriceTiersParams
>;
export const StoreGetPriceTiersParams = z
  .object({
    region_id: z.string().min(1),
    // One id, a comma list or a repeated param; at most 50 variants.
    variant_id: z
      .union([z.string(), z.array(z.string())])
      .transform((value) =>
        (Array.isArray(value) ? value : value.split(","))
          .map((id) => id.trim())
          .filter(Boolean)
      )
      .pipe(z.array(z.string()).min(1).max(50)),
  })
  .strict();
