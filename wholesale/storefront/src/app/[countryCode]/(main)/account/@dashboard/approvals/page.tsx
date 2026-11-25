import ApprovedApprovalRequestsAdminList from "@/modules/account/components/approval-requests-admin-list/approved-list"
import PendingApprovalRequestsAdminList from "@/modules/account/components/approval-requests-admin-list/pending-list"
import RejectedApprovalRequestsAdminList from "@/modules/account/components/approval-requests-admin-list/rejected-list"
import { retrieveCustomer } from "@/lib/data/customer"
import { Heading, Text } from "@medusajs/ui"
import { Metadata } from "next"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Approvals",
  description: "Overview of your pending approvals.",
}

export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const urlSearchParams = await searchParams
  // Polish 2026-11-25: an employee sees their own requests (read only); a
  // company admin sees the company's and decides them.
  const customer = await retrieveCustomer()
  const isAdmin = !!customer?.employee?.is_admin

  return (
    <div className="w-full flex flex-col gap-y-4">
      <Heading>{isAdmin ? "Approvals" : "My approval requests"}</Heading>
      {!isAdmin && (
        <Text className="text-ui-fg-subtle">
          Orders you sent to your company admin for approval.
        </Text>
      )}

      <Heading level="h2" className="text-neutral-700">
        Pending
      </Heading>
      <Suspense fallback={<div>Loading...</div>}>
        <PendingApprovalRequestsAdminList
          searchParams={urlSearchParams}
          isAdmin={isAdmin}
        />
      </Suspense>

      <Heading level="h2" className="text-neutral-700">
        Approved
      </Heading>
      <Suspense fallback={<div>Loading...</div>}>
        <ApprovedApprovalRequestsAdminList
          searchParams={urlSearchParams}
          isAdmin={isAdmin}
        />
      </Suspense>

      <Heading level="h2" className="text-neutral-700">
        Rejected
      </Heading>
      <Suspense fallback={<div>Loading...</div>}>
        <RejectedApprovalRequestsAdminList
          searchParams={urlSearchParams}
          isAdmin={isAdmin}
        />
      </Suspense>
    </div>
  )
}
