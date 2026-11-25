import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows";

// A company moved to another price tier (customer group): its employees'
// open carts are repriced, so the cart and the next quote asked from it show
// the new tier (role test 2026-11-25; Medusa reprices a cart only when it
// changes). `refreshCartItemsWorkflow` with `force_refresh`
// (core-flows dist/cart/workflows/refresh-cart-items.d.ts, 2.22.6).
//
// Not repriced: completed carts; carts waiting for or holding an approval,
// whose approved total must not move; carts with a quote, whose prices are
// the merchant's offer in the quote's draft order (the merchant edits it).
type EmployeeRow = { customer?: { id?: string | null } | null } | null;
type CartRow = {
  id: string;
  completed_at?: string | Date | null;
  approvals?: ({ id: string } | null)[] | null;
};
type QuoteRow = { id: string; cart_id?: string | null };

export async function refreshCompanyCarts(
  container: MedusaContainer,
  companyId: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [company],
  } = await query.graph({
    entity: "company",
    fields: ["id", "employees.customer.id"],
    filters: { id: companyId },
  });
  const employees: EmployeeRow[] = company?.employees ?? [];
  const customerIds = employees
    .map((employee) => employee?.customer?.id)
    .filter(Boolean) as string[];
  if (!customerIds.length) {
    return [];
  }

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "completed_at", "approvals.id"],
    filters: { customer_id: customerIds },
  });
  const candidates = (carts as CartRow[]).filter(
    (cart) => !cart.completed_at && !(cart.approvals ?? []).filter(Boolean).length
  );
  if (!candidates.length) {
    return [];
  }

  const { data: quotes } = await query.graph({
    entity: "quote",
    fields: ["id", "cart_id"],
    filters: { cart_id: candidates.map((cart) => cart.id) },
  });
  const quoted = new Set((quotes as QuoteRow[]).map((quote) => quote.cart_id));
  const open = candidates.filter((cart) => !quoted.has(cart.id));
  for (const cart of open) {
    await refreshCartItemsWorkflow(container).run({
      input: { cart_id: cart.id, force_refresh: true },
    });
  }
  return open.map((cart) => cart.id as string);
}
