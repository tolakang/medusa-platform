import type { Logger } from "@medusajs/framework/types"
import { createResendNotificationService, RESEND_EMAILS_URL } from "../service"
import { renderOrderEmail as renderEmail } from "../order-email"

// Built the way an app builds it, here with the core's order emails only.
const ResendNotificationProviderService = createResendNotificationService(renderEmail)

// Fake key only: fetch is mocked, nothing is sent (TASKS P1-04).
const options = { api_key: "re_test_example", from: "Shop <orders@example.com>" }
const logger = { info: jest.fn(), error: jest.fn() } as unknown as Logger

const order = {
  display_id: 1001,
  email: "customer@example.com",
  currency_code: "usd",
  total: 16.5,
  items: [{ title: "Tee <b>", variant_title: "M / <i>", quantity: 1, total: 15 }],
  shipping_address: { first_name: "Dara", address_1: "St. 51", city: "Phnom Penh" },
  shipping_methods: [{ name: "Phnom Penh Delivery" }],
}

describe("Resend provider", () => {
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it("posts the rendered order email to Resend with the idempotency key", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "email_1" }) })
    const service = new ResendNotificationProviderService({ logger }, options)

    const result = await service.send({
      to: "customer@example.com",
      channel: "email",
      template: "order-placed",
      data: { order },
      provider_data: { idempotency_key: "order-placed:email:order_1" },
    })

    expect(result).toEqual({ id: "email_1" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toEqual(RESEND_EMAILS_URL)
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer re_test_example",
        "Idempotency-Key": "order-placed:email:order_1",
      })
    )
    const body = JSON.parse(init.body)
    expect(body.from).toEqual("Shop <orders@example.com>")
    expect(body.to).toEqual(["customer@example.com"])
    expect(body.subject).toEqual("Order #1001 confirmed")
    expect(body.html).toContain("$16.50")
  })

  it("throws when Resend rejects the request, so the notification is marked failed", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: "The domain is not verified" }),
    })
    const service = new ResendNotificationProviderService({ logger }, options)
    await expect(
      service.send({ to: "a@example.com", channel: "email", template: "order-placed", data: { order } })
    ).rejects.toThrow("Resend returned 403: The domain is not verified")
  })

  it("throws for an unknown template without calling Resend", async () => {
    const service = new ResendNotificationProviderService({ logger }, options)
    await expect(
      service.send({ to: "a@example.com", channel: "email", template: "nope", data: {} })
    ).rejects.toThrow('No email template "nope"')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects missing options at startup", () => {
    expect(() => ResendNotificationProviderService.validateOptions({ from: "x" })).toThrow("api_key")
    expect(() => ResendNotificationProviderService.validateOptions({ api_key: "x" })).toThrow("from")
  })

  it("escapes customer text in the email HTML", () => {
    const email = renderEmail("order-placed", { order })
    expect(email?.html).toContain("Tee &lt;b&gt; (M / &lt;i&gt;)")
    expect(email?.html).not.toContain("Tee <b>")
  })

  it("shows a line's detail under the item, escaped (line_detail, TASKS P3-30 follow-up)", () => {
    const email = renderEmail("order-placed", {
      order: { ...order, items: [{ title: "Haircut", variant_title: "30 min", quantity: 1, total: 8, metadata: { line_detail: "Wed 25 Nov, 09:00–09:30 with <Sophea>\nAt: #12" } }] },
    })
    expect(email?.html).toContain("Wed 25 Nov, 09:00–09:30 with &lt;Sophea&gt;<br>At: #12")
  })
})
