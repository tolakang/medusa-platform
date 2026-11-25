import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { addCompanyToCustomerGroupWorkflow } from "../../../../../workflows/company/workflows/";
import { adminCompanyFields } from "../../query-config";
import { AdminAddCompanyToCustomerGroupType } from "../../validators";

export const POST = async (
  req: AuthenticatedMedusaRequest<AdminAddCompanyToCustomerGroupType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { id } = req.params;
  const { group_id } = req.body;

  await addCompanyToCustomerGroupWorkflow.run({
    input: { company_id: id, group_id },
    container: req.scope,
  });

  const {
    data: [company],
  } = await query.graph(
    {
      entity: "companies",
      // No query middleware runs on this route, so queryConfig is empty and
      // the answer was `{}` (role test 2026-11-25).
      fields: req.queryConfig?.fields ?? [...adminCompanyFields, "*customer_group"],
      filters: { id },
    },
    { throwIfKeyNotFound: true }
  );

  res.json({ company });
};
