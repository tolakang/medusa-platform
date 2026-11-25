import { MedusaService } from "@medusajs/framework/utils"
import { Seller } from "./models/seller"
import { SellerAdjustment } from "./models/seller-adjustment"
import { SellerCommission } from "./models/seller-commission"
import { SellerPayout } from "./models/seller-payout"

// Generated methods (MEDUSA_SKILL §3): createSellers, listSellers,
// updateSellers, createSellerCommissions, listSellerCommissions, …
class SellerModuleService extends MedusaService({
  Seller,
  SellerCommission,
  SellerAdjustment,
  SellerPayout,
}) {}

export default SellerModuleService
