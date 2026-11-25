import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ApprovalType } from "../../../types/approval";
import { requireCompanyMember } from "../../../utils/b2b-access";
import { StoreGetApprovalsType } from "./validators";

export const GET = async (
  req: AuthenticatedMedusaRequest<StoreGetApprovalsType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  // P4-07: company admins see their own company's approval requests.
  // Polish 2026-11-25: any other employee sees only the requests for their
  // own carts (read only; deciding stays admin-only in [id]/route.ts).
  const member = await requireCompanyMember(
    req.scope,
    req.auth_context.actor_id
  );
  const companyId = member.employee.company.id;
  const isAdmin = !!member.employee.is_admin;

  const {
    data: [company],
  } = await query.graph({
    entity: "company",
    fields: [
      "carts.*",
      "carts.approval_status.*",
      "carts.company.approval_settings.*",
      "carts.company.*",
      "carts.items.*",
      "carts.completed_at",
      "carts.customer.id",
      "carts.customer.first_name",
      "carts.customer.last_name",
      "carts.customer.email",
    ],
    filters: { id: companyId },
  });

  if (!company?.carts) {
    return res.json({ carts_with_approvals: [], count: 0 });
  }

  const { status } = req.validatedQuery || {};

  const visibleCarts = company.carts.filter(
    (cart) =>
      cart !== undefined &&
      cart !== null &&
      (isAdmin || cart.customer_id === req.auth_context.actor_id)
  );

  const cartIds = visibleCarts
    .map((cart) => cart!.id);

  if (!cartIds.length) {
    return res.json({ carts_with_approvals: [], count: 0 });
  }

  let approvalStatusFilters: any = {
    cart_id: cartIds,
  };

  if (status) {
    approvalStatusFilters.status = status;
  }

  const { data: approvalStatuses, metadata } = await query.graph({
    entity: "approval_status",
    ...req.queryConfig,
    fields: ["*", "cart.approvals.id"],
    filters: approvalStatusFilters,
  });

  const approvalIds = approvalStatuses
    .flatMap((approvalStatus) =>
      approvalStatus.cart?.approvals?.map((approval) => approval?.id)
    )
    .filter(Boolean) as string[];

  const { data: approvals } = await query.graph({
    entity: "approval",
    fields: ["*"],
    filters: {
      id: approvalIds,
      type: ApprovalType.ADMIN,
    },
  });

  const cartsWithAdminApprovals = visibleCarts
    .map((cart) => {
      const cartApprovals = approvals.filter(
        (approval) => approval.cart_id === cart?.id
      );
      if (cartApprovals.length > 0) {
        cart && (cart.approvals = cartApprovals);
        return cart;
      }
      return null;
    })
    .filter(Boolean);

  if (!cartsWithAdminApprovals.length) {
    return res.json({ carts_with_approvals: [], count: 0 });
  }

  res.json({
    carts_with_approvals: cartsWithAdminApprovals,
    ...metadata,
  });
};
