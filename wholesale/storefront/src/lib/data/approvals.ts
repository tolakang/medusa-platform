"use server"

import { sdk } from "@/lib/config"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
} from "@/lib/data/cookies"
import { FilterType } from "@/types"
import {
  ApprovalStatusType,
  StoreApprovalResponse,
  StoreApprovalsResponse,
} from "@/types/approval"
import { revalidateTag } from "next/cache"

type ListApprovalsParams = {
  status?: FilterType
  type?: FilterType
  offset?: number
  limit?: number
  order?: string
}

export const listApprovals = async ({
  status,
  type,
  offset = 0,
  limit = 100,
  order = "-updated_at",
}: ListApprovalsParams = {}) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("approvals")),
  }

  const result = await sdk.client.fetch<StoreApprovalsResponse>(
    `/store/approvals`,
    {
      query: {
        status,
        type,
        offset,
        limit,
        order,
      },
      method: "GET",
      headers,
      next,
      credentials: "include",
    }
  )

  return result
}


// Server actions return refusals as `{ error }`: a thrown message is hidden
// from the browser in production ("Minified React error"), role test
// 2026-11-25.
export const updateApproval = async (
  approvalId: string,
  status: ApprovalStatusType
): Promise<{ error: string } | { approval: StoreApprovalResponse["approval"] }> => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  try {
    const { approval } = await sdk.client.fetch<StoreApprovalResponse>(
      `/store/approvals/${approvalId}`,
      {
        method: "POST",
        headers,
        body: {
          status,
        },
        credentials: "include",
      }
    )

    const cacheTag = await getCacheTag("approvals")
    revalidateTag(cacheTag, { expire: 0 })

    const cartTag = await getCacheTag("carts")
    revalidateTag(cartTag, { expire: 0 })

    return { approval }
  } catch (e) {
    return {
      error:
        (e as Error)?.message ||
        "Couldn't save the decision. Reload and try again.",
    }
  }
}
