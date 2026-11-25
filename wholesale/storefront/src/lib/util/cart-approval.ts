import { ApprovalStatusType, B2BCart, B2BCustomer } from "@/types"

// The approval types a cart needs, as the backend decides them
// (backend utils/b2b-cart-rules.ts requiredApprovalTypes): the types the
// company switched on, only above its threshold (none = every cart), and a
// company admin's own cart skips the company-admin approval.
export function requiredApprovalTypes(
  cart: B2BCart,
  customer: B2BCustomer | null | undefined
): ("admin" | "sales_manager")[] {
  const settings = cart.company?.approval_settings as
    | {
        requires_admin_approval?: boolean
        requires_sales_manager_approval?: boolean
        approval_threshold?: number | null
      }
    | undefined
  if (!settings) {
    return []
  }
  const threshold = settings.approval_threshold
  if (
    threshold !== null &&
    threshold !== undefined &&
    Number(cart.total ?? 0) <= Number(threshold)
  ) {
    return []
  }
  const types: ("admin" | "sales_manager")[] = []
  if (settings.requires_admin_approval && !customer?.employee?.is_admin) {
    types.push("admin")
  }
  if (settings.requires_sales_manager_approval) {
    types.push("sales_manager")
  }
  return types
}

/** The cart still waits for an approval before it can be paid. */
export function cartAwaitsApproval(
  cart: B2BCart,
  customer: B2BCustomer | null | undefined
) {
  return (
    requiredApprovalTypes(cart, customer).length > 0 &&
    cart.approval_status?.status !== ApprovalStatusType.APPROVED
  )
}
