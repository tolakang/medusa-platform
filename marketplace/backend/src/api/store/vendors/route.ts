import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /store/vendors (bug 2026-11-25: /kh/vendors 404'd): the shop directory.
// Active vendors only, by name, with their public details (no email, status or
// commission).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { data: vendors } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor",
    fields: ["id", "handle", "name", "logo"],
    filters: { status: "active" },
    pagination: { order: { name: "ASC" }, take: 500 },
  })
  res.json({
    vendors: vendors.map((v) => ({ id: v.id, handle: v.handle, name: v.name, logo: v.logo })),
  })
}
