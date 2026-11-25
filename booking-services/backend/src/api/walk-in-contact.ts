import { z } from "@medusajs/framework/zod"
import { isValidPhone, PHONE_MESSAGE } from "@medusa-platform/medusa-core/lib/phone"

// A walk-in's own name and phone (admin and provider walk-in forms), for a
// person without a customer account. The phone follows the checkout rule
// (medusa-core lib/phone, as the storefront's phone input).
export const walkInContact = {
  walk_in_name: z.string().trim().max(120).nullish(),
  walk_in_phone: z.string().trim().max(30).refine(isValidPhone, PHONE_MESSAGE).nullish(),
}
