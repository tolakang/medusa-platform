import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * The quoted total of a quote's draft order, with the merchant's pending
 * edits (`previewOrderChange`): the total quote acceptance checks.
 */
export async function quoteTotal(container: MedusaContainer, draftOrderId: string) {
  const preview = await container
    .resolve(Modules.ORDER)
    .previewOrderChange(draftOrderId);
  return Number(preview.total ?? 0);
}

/**
 * The quoted total when the cart belongs to an open quote (waiting on the
 * merchant or the customer), else null: a quoted cart's approvals are for
 * the quote's total, not the cart's.
 */
export async function openQuoteTotalForCart(container: MedusaContainer, cartId: string) {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "quote",
    fields: ["id", "status", "draft_order_id"],
    filters: { cart_id: cartId },
  });
  const open = data.find(
    (quote) => quote.status === "pending_merchant" || quote.status === "pending_customer"
  );
  return open ? quoteTotal(container, open.draft_order_id) : null;
}
