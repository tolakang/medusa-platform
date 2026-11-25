import { retrieveCustomer } from "@lib/data/customer"
import { listMyBookings } from "@lib/data/booking"
import { retrieveOrder } from "@lib/data/orders"
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

  // Only the customer's own orders (the backend also refuses others, but
  // the cookie proof of a guest order would pass it there).
  if (!order || !customer || order.customer_id !== customer.id) {
    notFound()
  }

  // The order's bookings, for their status on a service order (P3-13).
  const bookings = ((await listMyBookings().catch(() => null)) ?? []).filter((b) => b.order?.id === order.id)

  return <OrderDetailsTemplate order={order} bookingStatuses={bookings.map((b) => b.status)} />
}
