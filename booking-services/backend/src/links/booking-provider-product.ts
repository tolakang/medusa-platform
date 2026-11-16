import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import BookingModule from "../modules/booking"

// A provider has many services; a service (product) has one provider
// (BUILD_PLAN §9.3 "Ownership", TASKS P3-31), as Marketplace's vendor-product
// link (official Vendors example). Products without a link are the shop's own.
export default defineLink(BookingModule.linkable.bookingProvider, {
  linkable: ProductModule.linkable.product.id,
  isList: true,
})
