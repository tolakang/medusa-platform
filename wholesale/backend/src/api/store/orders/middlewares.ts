import { MiddlewareRoute } from "@medusajs/medusa";
import { requireOrderAccessWith } from "@medusa-platform/medusa-core/api/order-access";
import { loadBuyer } from "../../../utils/load-b2b-buyer";

// GET /store/orders/:id: Medusa answers anyone with the id (name, address,
// phone). Only the order's customer, an admin of the buyer's company (the
// same rule as the invoice PDF, assertCanSeeOrderInvoice), or the browser that
// placed it (signed x-order-access proof); 404 otherwise.
const requireOrderAccess = requireOrderAccessWith(async (scope, order, customerId) => {
  const [viewer, owner] = await Promise.all([
    loadBuyer(scope, customerId),
    loadBuyer(scope, order.customer_id),
  ]);
  const company = viewer?.employee?.company?.id;
  return !!viewer?.employee?.is_admin && !!company && company === owner?.employee?.company?.id;
});

export const storeOrdersMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/store/orders/:id",
    middlewares: [requireOrderAccess],
  },
];
