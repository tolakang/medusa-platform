import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { removeCompanyFromCustomerGroupWorkflow } from "../../../../../../workflows/company/workflows/remove-company-from-customer-group";
import { refreshCompanyCarts } from "../../../../../../utils/refresh-company-carts";
import { AdminRemoveCompanyFromCustomerGroupType } from "../../../validators";

export const DELETE = async (
  req: AuthenticatedMedusaRequest<AdminRemoveCompanyFromCustomerGroupType>,
  res: MedusaResponse
) => {
  const { id, customerGroupId } = req.params;

  await removeCompanyFromCustomerGroupWorkflow.run({
    input: { company_id: id, group_id: customerGroupId },
    container: req.scope,
  });
  await refreshCompanyCarts(req.scope, id);

  res.status(200).send();
};
