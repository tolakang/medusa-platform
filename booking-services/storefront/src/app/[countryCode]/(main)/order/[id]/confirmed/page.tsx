import { retrieveCustomer } from "@lib/data/customer"
import { hasOrderAccess } from "@lib/data/order-access"
import { retrieveOrder } from "@lib/data/orders"
import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"
import { Metadata } from "next"
import { notFound } from "next/navigation"

type Props = {
  params: Promise<{ id: string }>
}
export const metadata: Metadata = {
  title: "Order Confirmed",
  description: "Your order was placed",
  robots: { index: false, follow: false },
}

export default async function OrderConfirmedPage(props: Props) {
  const params = await props.params
  const order = await retrieveOrder(params.id).catch(() => null)

  if (!order) {
    return notFound()
  }

  // Name, address and phone only for the browser that placed the order or
  // the signed-in customer who owns it (order-access.ts).
  const customer = await retrieveCustomer().catch(() => null)
  const isOwner = !!customer && order.customer_id === customer.id

  if (isOwner || (await hasOrderAccess(order.id))) {
    return <OrderCompletedTemplate order={order} />
  }

  return (
    <div className="py-6 min-h-[calc(100vh-64px)]">
      <div
        className="content-container flex flex-col gap-y-4 max-w-4xl py-10"
        data-testid="order-complete-minimal"
      >
        <Heading level="h1" className="text-3xl">
          Order placed
        </Heading>
        <Text className="text-ui-fg-subtle">
          Order #{order.display_id} was placed. Sign in to the account that
          placed it to see the details.
        </Text>
        <div className="flex gap-x-4">
          <LocalizedClientLink href="/account" className="underline">
            Sign in
          </LocalizedClientLink>
          <LocalizedClientLink href="/store" className="underline">
            Continue shopping
          </LocalizedClientLink>
        </div>
      </div>
    </div>
  )
}
