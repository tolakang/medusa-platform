import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  capturePaymentWorkflow,
  createOrderPaymentCollectionWorkflow,
  refundPaymentWorkflow,
} from "@medusajs/medusa/core-flows"
import paymentRefundedAlert, { config } from "../../src/subscribers/payment-refunded-alert"
import { renderMessage } from "../../src/modules/telegram/templates"

// Staff refund alert from the shared core (packages/medusa-core, BUILD_PLAN.md
// §4.1, §4.2). No TELEGRAM_BOT_TOKEN in tests, so "telegram" goes to
// notification-local, which only logs. The runner loads the app's
// subscribers, so a refund's payment.refunded event sends the alert by itself.
jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("refund alert (shared core)", () => {
      const paidOrder = async () => {
        const container = getContainer()
        const [order] = await container.resolve(Modules.ORDER).createOrders([
          {
            email: "customer@example.com",
            currency_code: "usd",
            items: [{ title: "Medusa T-Shirt", quantity: 2, unit_price: 15 }],
            shipping_address: { first_name: "Dara", phone: "+855 12 345 678", country_code: "kh" },
          },
        ])
        const {
          result: [collection],
        } = await createOrderPaymentCollectionWorkflow(container).run({
          input: { order_id: order.id, amount: 30 },
        })
        const paymentModule = container.resolve(Modules.PAYMENT)
        const session = await paymentModule.createPaymentSession(collection.id, {
          provider_id: "pp_system_default",
          amount: 30,
          currency_code: "usd",
          data: {},
        })
        const payment = (await paymentModule.authorizePaymentSession(session.id, {}))!
        await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id } })
        return { order, paymentId: payment.id }
      }

      const alertsFor = async (orderId: string) => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "notification",
          fields: ["channel", "status", "to", "template", "idempotency_key", "data"],
          filters: { resource_id: orderId, template: "payment-refunded-staff" },
        })
        return data
      }
      const eventually = async <T,>(read: () => Promise<T>, ok: (v: T) => boolean) => {
        let value = await read()
        for (let i = 0; i < 40 && !ok(value); i++) {
          await new Promise((r) => setTimeout(r, 250))
          value = await read()
        }
        return value
      }

      it("alerts staff once per refund, from the payment.refunded event", async () => {
        expect(config.event).toEqual("payment.refunded")
        const { order, paymentId } = await paidOrder()

        await refundPaymentWorkflow(getContainer()).run({
          input: { payment_id: paymentId, amount: 10, note: "Wrong size" },
        })
        const first = await eventually(() => alertsFor(order.id), (a) => a.length === 1)
        expect(first).toHaveLength(1)
        expect(first[0]).toEqual(
          expect.objectContaining({ channel: "telegram", status: "success", to: "staff" })
        )
        expect(first[0].idempotency_key).toMatch(/^payment-refunded:telegram:/)

        // A retried event doesn't send again.
        await paymentRefundedAlert({
          event: { name: "payment.refunded", data: { id: paymentId } },
          container: getContainer(),
        } as Parameters<typeof paymentRefundedAlert>[0])
        expect(await alertsFor(order.id)).toHaveLength(1)

        // This app's Telegram provider renders the core's message.
        const text = renderMessage("payment-refunded-staff", first[0].data as Record<string, unknown>)
        expect(text).toContain("💸 Refund on order #")
        expect(text).toContain("— $10.00")
        expect(text).toContain("Note: Wrong size")
        expect(text).toContain("Refunded so far: $10.00 of $30.00 paid")
        expect(text).toContain("Customer: Dara, customer@example.com")

        // A second refund gets its own alert.
        await refundPaymentWorkflow(getContainer()).run({
          input: { payment_id: paymentId, amount: 5 },
        })
        const both = await eventually(() => alertsFor(order.id), (a) => a.length === 2)
        expect(both).toHaveLength(2)
      })

      it("sends nothing for an unknown payment", async () => {
        await paymentRefundedAlert({
          event: { name: "payment.refunded", data: { id: "pay_missing" } },
          container: getContainer(),
        } as Parameters<typeof paymentRefundedAlert>[0])
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "notification",
          fields: ["id"],
          filters: { template: "payment-refunded-staff" },
        })
        expect(data).toEqual([])
      })
    })
  },
})
