import { model } from "@medusajs/framework/utils";
import { ApprovalStatusType, ApprovalType } from "../../../types/approval";

export const Approval = model.define("approval", {
  id: model
    .id({
      prefix: "appr",
    })
    .primaryKey(),
  cart_id: model.text(),
  type: model.enum(ApprovalType),
  status: model.enum(ApprovalStatusType),
  created_by: model.text(),
  handled_by: model.text().nullable(),
  // The total the approval was asked for (the cart's item total, or a
  // quoted cart's quote total). It only covers an order up to that total;
  // null (approvals from before 2026-11-25) covers any total.
  covered_total: model.bigNumber().nullable(),
});
