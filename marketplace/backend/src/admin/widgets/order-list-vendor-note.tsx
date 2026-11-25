import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Text } from "@medusajs/ui"
import { adminLink } from "../lib/marketplace"

// Above Medusa's Orders list (zone "order.list.before", @medusajs/admin-shared
// INJECTION_ZONES): the list shows each customer order and its vendor orders
// side by side, which reads like double revenue (bug 2026-11-25). A widget
// can't filter or relabel the core list, so it says how to read it and links
// to the vendor-orders view.
const OrderListVendorNote = () => (
  <Container className="px-6 py-3">
    <Text size="small" className="text-ui-fg-subtle">
      This list shows customer orders and, next to them, the vendor orders they were split into
      (one per vendor, without a payment). Count revenue from customer orders only. Vendor orders
      are listed on their own under{" "}
      <a href={adminLink("/vendor-orders")} className="text-ui-fg-interactive hover:underline">
        Vendor orders
      </a>
      .
    </Text>
  </Container>
)

export const config = defineWidgetConfig({ zone: "order.list.before" })

export default OrderListVendorNote
