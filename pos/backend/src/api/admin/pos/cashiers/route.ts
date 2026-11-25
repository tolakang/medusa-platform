import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { inviteCode } from "@medusa-platform/medusa-core/lib/invite-code"
import { POS_MODULE } from "../../../../modules/pos"
import type PosModuleService from "../../../../modules/pos/service"
import { createPosCashierWorkflow } from "../../../../workflows/pos-cashier"
import type { PostAdminPosCashierType } from "./validators"

// GET/POST /admin/pos/cashiers (TASKS P2-03): admins list and invite cashiers.
// /admin/* requires an admin user (MEDUSA_SKILL §7). The invited cashier then
// registers the same email at /auth/cashier/emailpass/register and accepts at
// /pos/cashiers/accept with the `invite_code` returned here.

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const pos: PosModuleService = req.scope.resolve(POS_MODULE)
  const cashiers = await pos.listPosCashiers({}, { order: { name: "ASC" } })
  // Who has set a password and accepted: their emailpass identity is linked
  // to the cashier (app_metadata.cashier_id, accept-pos-cashier-invite).
  // MEDUSA_SKILL §7: emailpass provider identity entity_id = the email.
  const identities = cashiers.length
    ? await req.scope.resolve(Modules.AUTH).listProviderIdentities(
        // Module filters take a list (MEDUSA_SKILL §7); the DTO type lists a plain string.
        { entity_id: cashiers.map((c) => c.email) as unknown as string, provider: "emailpass" },
        { relations: ["auth_identity"] }
      )
    : []
  const linked = new Set(identities.map((p) => p.auth_identity?.app_metadata?.cashier_id).filter(Boolean))
  // The invite code is the admin's to hand to each cashier (REVIEW_FIXES B11);
  // once the cashier has set a password it is spent, so it is no longer sent.
  res.json({
    cashiers: cashiers.map((cashier) => {
      const password_set = linked.has(cashier.id)
      return { ...cashier, password_set, invite_code: password_set ? null : inviteCode("cashier", cashier.id) }
    }),
  })
}

export const POST = async (req: MedusaRequest<PostAdminPosCashierType>, res: MedusaResponse) => {
  const { result } = await createPosCashierWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({
    cashier: result,
    invite_code: inviteCode("cashier", result.id),
  })
}
