import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { APPROVAL_MODULE } from "../../../modules/approval";
import { ApprovalStatusType, IApprovalModuleService } from "../../../types";

// Sets the cart's approval status to pending, creating it on the first
// request. `created` tells the workflow whether to link it to the cart: the
// cart-status link is one-to-one, so a second request (after a rejection,
// or an approval that covers a lower total) must not link again.
export const createApprovalStatusStep = createStep(
  "create-approval-status",
  async (cartIds: string[], { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const approvalModuleService =
      container.resolve<IApprovalModuleService>(APPROVAL_MODULE);

    const {
      data: [existingApprovalStatus],
    } = await query.graph({
      entity: "approval_status",
      fields: ["*"],
      filters: {
        cart_id: cartIds[0],
      },
    });

    if (existingApprovalStatus) {
      const [approvalStatus] =
        await approvalModuleService.updateApprovalStatuses([
          {
            id: existingApprovalStatus.id,
            status: ApprovalStatusType.PENDING,
          },
        ]);

      return new StepResponse(
        { status: approvalStatus, created: false },
        {
          restore: {
            id: existingApprovalStatus.id as string,
            status: existingApprovalStatus.status as unknown as ApprovalStatusType,
          },
        }
      );
    }

    const approvalStatusesToCreate = cartIds.map((cartId) => ({
      cart_id: cartId,
      status: ApprovalStatusType.PENDING,
    }));

    const [approvalStatus] = await approvalModuleService.createApprovalStatuses(
      approvalStatusesToCreate
    );

    return new StepResponse(
      { status: approvalStatus, created: true },
      { deleteIds: [approvalStatus.id] }
    );
  },
  async (
    compensation:
      | {
          restore?: { id: string; status: ApprovalStatusType };
          deleteIds?: string[];
        }
      | undefined,
    { container }
  ) => {
    if (!compensation) {
      return;
    }

    const approvalModuleService =
      container.resolve<IApprovalModuleService>(APPROVAL_MODULE);

    if (compensation.restore) {
      await approvalModuleService.updateApprovalStatuses([compensation.restore]);
    }
    if (compensation.deleteIds?.length) {
      await approvalModuleService.deleteApprovalStatuses(compensation.deleteIds);
    }
  }
);
