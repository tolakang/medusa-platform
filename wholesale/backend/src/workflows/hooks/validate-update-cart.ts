import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { updateCartWorkflow } from "@medusajs/medusa/core-flows";
import { getCartApprovalStatus } from "../../utils/get-cart-approval-status";

// A cart waiting for approval or approved is locked (owner, 2026-11-25):
// a new region, address or set of items could change what was approved.
// Shipping methods and payment sessions have their own routes and
// workflows, so checkout still finishes after the approval.
updateCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [queryCart],
  } = await query.graph({
    entity: "cart",
    fields: ["approvals.*"],
    filters: {
      id: cart.id,
    },
  });

  const { isPendingApproval, isApproved } = getCartApprovalStatus(queryCart);

  if (isPendingApproval) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cart is pending approval");
  }
  if (isApproved) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This cart is approved, so it can't change. Place the order, or start a new cart."
    );
  }

  return new StepResponse(undefined, null);
});
