import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../modules/pos"
import type PosModuleService from "../../../modules/pos/service"

// GET /pos/registers (TASKS P2-06): the active registers a cashier can pick,
// with their stock location, sales channel and open shift (if any). The open
// shift carries `opened_by_name` so the till can say who opened it (shared
// shifts, plan allows them), and the list carries the store's default
// `currency_code`, the currency a new shift opens in (open-pos-shift).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "pos_register",
    fields: ["id", "name", "code", "stock_location.id", "stock_location.name", "sales_channel.id", "sales_channel.name"],
    filters: { is_active: true },
    pagination: { order: { name: "ASC" } },
  })
  const pos: PosModuleService = req.scope.resolve(POS_MODULE)
  const open = data.length
    ? await pos.listPosShifts({ status: "open", register_id: data.map((r) => r.id) })
    : []
  const openerIds = [...new Set(open.map((s) => s.opened_by))]
  const openers = openerIds.length ? await pos.listPosCashiers({ id: openerIds }) : []
  const names = new Map(openers.map((c) => [c.id, c.name]))
  const registers = data.map((r) => {
    const shift = open.find((s) => s.register_id === r.id)
    return { ...r, open_shift: shift ? { ...shift, opened_by_name: names.get(shift.opened_by) ?? null } : null }
  })
  const [store] = await req.scope.resolve(Modules.STORE).listStores({}, { relations: ["supported_currencies"] })
  const currency_code = store?.supported_currencies?.find((c) => c.is_default)?.currency_code ?? null
  res.json({ registers, currency_code })
}
