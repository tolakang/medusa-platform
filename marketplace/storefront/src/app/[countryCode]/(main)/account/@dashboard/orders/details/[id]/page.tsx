import { retrieveCustomer } from "@lib/data/customer"
import { retrieveOrder, retrieveOrderShipments } from "@lib/data/orders"
import { getProductVendors } from "@lib/data/vendors"
import { productIdsOf } from "@lib/util/group-by-vendor"
import OrderDetailsTemplate from "@modules/order/templates/order-details-template"
import { Metadata } from "next"
import { notFound } from "next/navigation"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const order = await retrieveOrder(params.id).catch(() => null)

  if (!order) {
    notFound()
  }

  return {
    title: `Order #${order.display_id}`,
    description: `View your order`,
  }
}

export default async function OrderDetailPage(props: Props) {
  const params = await props.params
  const order = await retrieveOrder(params.id).catch(() => null)
  const customer = await retrieveCustomer().catch(() => null)

  // Only the customer's own orders: /store/orders/:id answers anyone with
  // the id, so the account page checks the owner itself.
  if (!order || !customer || order.customer_id !== customer.id) {
    notFound()
  }

  const [vendors, shipments] = await Promise.all([
    getProductVendors(productIdsOf(order?.items)),
    retrieveOrderShipments(order.id),
  ])

  return (
    <OrderDetailsTemplate
      order={order}
      vendors={vendors}
      shipments={shipments}
    />
  )
}
