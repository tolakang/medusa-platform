"use client"

import { updateApproval } from "@/lib/data/approvals"
import Button from "@/modules/common/components/button"
import { ApprovalStatusType, ApprovalType } from "@/types/approval"
import { B2BCart } from "@/types/global"
import {
  ArrowRightMini,
  CheckMini,
  LockClosedSolidMini,
  XMarkMini,
} from "@medusajs/icons"
import { toast, usePrompt } from "@medusajs/ui"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"

const ApprovalCardActions = ({
  cartWithApprovals,
}: {
  cartWithApprovals: B2BCart
}) => {
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const { countryCode } = useParams()
  const router = useRouter()

  const dialog = usePrompt()
  if (!cartWithApprovals?.approvals) return null

  const pendingAdminApproval =
    cartWithApprovals.approval_status?.status === ApprovalStatusType.PENDING
      ? cartWithApprovals.approvals?.find(
          (a) =>
            a?.type === ApprovalType.ADMIN &&
            a?.status === ApprovalStatusType.PENDING
        )
      : null

  const handleApprove = async () => {
    if (!pendingAdminApproval) return

    const confirmed = await dialog({
      title: "Are you sure you want to approve this cart?",
      description: "This action cannot be undone.",
    })

    if (!confirmed) return

    setApproving(true)
    // A refused decision (already decided, gone) used to leave the button
    // spinning with no message.
    try {
      const result = await updateApproval(
        pendingAdminApproval.id,
        ApprovalStatusType.APPROVED
      )
      if ("error" in result) {
        toast.error(result.error)
      }
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async () => {
    if (!pendingAdminApproval) return

    const confirmed = await dialog({
      title: "Are you sure you want to reject this cart?",
      description: "This action cannot be undone.",
    })

    if (!confirmed) return

    setRejecting(true)
    // A refused decision (already decided, gone) used to leave the button
    // spinning with no message.
    try {
      const result = await updateApproval(
        pendingAdminApproval.id,
        ApprovalStatusType.REJECTED
      )
      if ("error" in result) {
        toast.error(result.error)
      }
    } finally {
      setRejecting(false)
    }
  }

  const handlePlaceOrder = () => {
    setIsRedirecting(true)
    router.push(
      `/${countryCode}/checkout?cartId=${cartWithApprovals.id}&step=payment`
    )
  }

  return (
    <div className="flex gap-x-2">
      {pendingAdminApproval ? (
        <>
          {"·"}
          <Button
            size="small"
            className="px-3"
            variant="secondary"
            onClick={handleReject}
            disabled={approving}
            isLoading={rejecting}
          >
            <XMarkMini className="inline-block" />
            Reject
          </Button>
          <Button
            size="small"
            className="px-3"
            variant="primary"
            onClick={handleApprove}
            disabled={rejecting}
            isLoading={approving}
          >
            <CheckMini className="inline-block" />
            Approve
          </Button>
        </>
      ) : cartWithApprovals.approval_status?.status ===
        ApprovalStatusType.PENDING ? (
        <>
          {"·"}
          <Button variant="primary" disabled>
            <LockClosedSolidMini className="inline-block" />
            Awaiting External Approval
          </Button>
        </>
      ) : cartWithApprovals.approval_status?.status ===
        ApprovalStatusType.APPROVED ? (
        !cartWithApprovals.completed_at ? (
          <>
            {"·"}
            <Button
              variant="primary"
              size="small"
              className="px-3"
              isLoading={isRedirecting}
              onClick={handlePlaceOrder}
            >
              Place Order
              <ArrowRightMini className="inline-block" />
            </Button>
          </>
        ) : null
      ) : null}
    </div>
  )
}

export default ApprovalCardActions
