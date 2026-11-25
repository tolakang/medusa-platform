import { retrieveCart } from "@/lib/data/cart"
import { formatDate } from "@/lib/util/format-date"
import { convertToLocale } from "@/lib/util/money"
import ApprovalCardActions from "@/modules/account/components/approval-card-actions"
import CalendarIcon from "@/modules/common/icons/calendar"
import DocumentIcon from "@/modules/common/icons/document"
import { ApprovalStatusType } from "@/types/approval"
import { B2BCart } from "@/types/global"
import { CheckMini, XMarkMini } from "@medusajs/icons"
import { clx, Container, Text } from "@medusajs/ui"
import Image from "next/image"

type ApprovalCardProps = {
  cartWithApprovals: B2BCart
  type?: "admin" | "customer"
}

export default async function ApprovalCard({
  cartWithApprovals,
  type = "customer",
}: ApprovalCardProps) {
  const cart = await retrieveCart(cartWithApprovals.id)

  if (!cart) {
    return null
  }

  const createdAt = new Date(cart.created_at!)
  const updatedAt = new Date(cart.updated_at!)

  const numberOfLines = cart.items?.length ?? 0

  // Polish 2026-11-25: who asked, and what is in the cart, so the admin
  // decides without opening the buyer's cart.
  const requester = cartWithApprovals.customer
  const requesterName =
    [requester?.first_name, requester?.last_name].filter(Boolean).join(" ") ||
    requester?.email ||
    cart.email ||
    "Unknown buyer"
  const lines = cartWithApprovals.items?.length
    ? cartWithApprovals.items
    : cart.items ?? []

  return (
    <Container className="bg-white flex flex-col p-4 rounded-md gap-y-2">
    <div className="flex small:flex-row flex-col small:justify-between small:items-center gap-y-2 items-start">
      <div className="flex gap-x-4 items-center pl-3">
        <div className="flex min-w-10">
          {cart.items?.slice(0, 3).map((i, index) => {
            const numItems = cart.items?.length ?? 0

            return (
              <div
                key={i.id}
                className={clx(
                  "block w-7 h-7 border border-white bg-neutral-100 p-2 bg-cover bg-center rounded-md ml-[-5px]",
                  {
                    "-rotate-3": index === 0 && numItems > 1,
                    "rotate-0": index === 0 && numItems === 1,
                    "rotate-3":
                      (index === 1 && numItems === 2) ||
                      (index === 2 && numItems > 2),
                  }
                )}
              >
                <Image
                  src={i.thumbnail!}
                  alt={i.title}
                  className={clx("h-full w-full object-cover object-center", {
                    "-rotate-3": index === 0 && numItems > 1,
                    "rotate-0": index === 0 && numItems === 1,
                    "rotate-3":
                      (index === 1 && numItems === 2) ||
                      (index === 2 && numItems > 2),
                  })}
                  draggable={false}
                  quality={50}
                  width={20}
                  height={20}
                />
              </div>
            )
          })}
        </div>

        <div
          className="flex pr-2 text-small-regular items-center"
          data-testid="order-created-at"
        >
          <CalendarIcon className="inline-block mr-1" />
          {formatDate(createdAt)}
        </div>

        <div className="flex items-center text-small-regular">
          <DocumentIcon className="inline-block mr-1" />
          <span data-testid="order-display-id">#{cart.id.slice(-4)}</span>
        </div>
        {cartWithApprovals.approval_status?.status ===
        ApprovalStatusType.APPROVED ? (
          cartWithApprovals.completed_at ? (
            <Text className="flex items-center gap-x-1 text-xs text-grey-500">
              <CheckMini className="inline-block" />
              Order completed at{" "}
              {formatDate(updatedAt)}
            </Text>
          ) : (
            <Text className="flex items-center gap-x-1 text-xs text-grey-500">
              Approved at{" "}
              {formatDate(updatedAt)}
              <CheckMini className="inline-block" />
            </Text>
          )
        ) : null}

        {cartWithApprovals.approval_status?.status ===
          ApprovalStatusType.REJECTED && (
          <div className="flex items-center text-small-regular">
            <XMarkMini className="inline-block mr-1" />
            <span data-testid="order-display-id">
              Rejected at{" "}
              {formatDate(updatedAt)}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-x-4 divide-gray-200 small:justify-normal justify-between w-full small:w-auto">
        <div className="flex items-center text-small-regular text-ui-fg-base">
          <span className="px-2" data-testid="order-amount">
            {convertToLocale({
              amount: cart.total,
              currency_code: cart.currency_code,
            })}
          </span>
          {"·"}
          <span className="px-2">{`${numberOfLines} ${
            numberOfLines > 1 ? "items" : "item"
          }`}</span>
          {type === "admin" && (
            <ApprovalCardActions cartWithApprovals={cartWithApprovals} />
          )}
        </div>
      </div>
    </div>
      <Text className="text-small-regular text-ui-fg-subtle pl-3">
        Requested by{" "}
        <span className="text-ui-fg-base" data-testid="approval-requester">
          {requesterName}
        </span>
        {requester?.email && requesterName !== requester.email
          ? ` (${requester.email})`
          : ""}
      </Text>
      {lines.length > 0 && (
        <details className="pl-3 text-small-regular" data-testid="approval-items">
          <summary className="cursor-pointer text-ui-fg-interactive">
            Show items
          </summary>
          <ul className="mt-2 flex flex-col gap-y-1">
            {lines.map((item) => (
              <li key={item.id} className="flex justify-between gap-x-4">
                <span>
                  {item.product_title ?? item.title}
                  {item.variant_title ? ` · ${item.variant_title}` : ""}
                </span>
                <span className="text-ui-fg-subtle whitespace-nowrap">
                  {item.quantity} ×{" "}
                  {convertToLocale({
                    amount: item.unit_price ?? 0,
                    currency_code: cart.currency_code,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Container>
  )
}
