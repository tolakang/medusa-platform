"use server"

import { sdk } from "@/lib/config"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  removeCartId,
} from "@/lib/data/cookies"
import {
  QuoteFilterParams,
  StoreCreateQuoteMessage,
  StoreQuotePreviewResponse,
  StoreQuoteResponse,
  StoreQuotesResponse,
} from "@/types"
import { track } from "@vercel/analytics/server"
import { revalidateTag } from "next/cache"

export const createQuote = async () => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const cartId = await getCartId()

  return sdk.client
    .fetch<StoreQuoteResponse>(`/store/quotes`, {
      method: "POST",
      body: { cart_id: cartId },
      headers,
    })
    .then(async (quote) => {
      track("quote_created", {
        quote_id: quote.quote.id,
      })

      // The cart became the quote ("the cart will be converted to a quote"):
      // forget it, as a placed order does, so the header no longer shows its
      // items and the buyer can't also check the same goods out and get them
      // twice. Accepting the quote makes the order.
      await removeCartId()
      revalidateTag(await getCacheTag("carts"), { expire: 0 })

      return quote
    })
}

export const fetchQuotes = async (query?: QuoteFilterParams) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("quotes")),
  }

  return sdk.client.fetch<StoreQuotesResponse>(
    `/store/quotes?order=-created_at`,
    {
      method: "GET",
      query,
      headers,
      next,
    }
  )
}

export const fetchQuote = async (id: string, query?: QuoteFilterParams) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions(["quote", id].join("-"))),
  }

  return sdk.client.fetch<StoreQuoteResponse>(`/store/quotes/${id}`, {
    method: "GET",
    query,
    headers,
    next,
  })
}

export const fetchQuotePreview = async (
  id: string,
  query?: QuoteFilterParams
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions(["quotePreview", id].join("-"))),
  }

  return sdk.client.fetch<StoreQuotePreviewResponse>(
    `/store/quotes/${id}/preview`,
    {
      method: "GET",
      query,
      headers,
      next,
    }
  )
}

export const acceptQuote = async (id: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.client
    .fetch<StoreQuoteResponse>(`/store/quotes/${id}/accept`, {
      method: "POST",
      body: {},
      headers,
    })
    .then((res) => {
      track("quote_accepted", {
        quote_id: res.quote.id,
      })

      return res
    })
    .finally(async () => {
      const tags = await Promise.all([
        getCacheTag("quotes"),
        getCacheTag(["quote", id].join("-")),
        getCacheTag(["quotePreview", id].join("-")),
      ])
      tags.forEach((tag) => revalidateTag(tag, { expire: 0 }))
    })
}

export const rejectQuote = async (id: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.client
    .fetch<StoreQuoteResponse>(`/store/quotes/${id}/reject`, {
      method: "POST",
      body: {},
      headers,
    })
    .finally(async () => {
      const tags = await Promise.all([
        getCacheTag("quotes"),
        getCacheTag(["quote", id].join("-")),
        getCacheTag(["quotePreview", id].join("-")),
      ])
      tags.forEach((tag) => revalidateTag(tag, { expire: 0 }))
    })
}

export const createQuoteMessage = async (
  id: string,
  body: StoreCreateQuoteMessage
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.client
    .fetch<StoreQuoteResponse>(`/store/quotes/${id}/messages`, {
      method: "POST",
      body,
      headers,
    })
    .then((res) => {
      track("quote_message_created", {
        quote_id: res.quote.id,
      })

      return res
    })
    .finally(async () => {
      const tags = await Promise.all([
        getCacheTag("quotes"),
        getCacheTag(["quote", id].join("-")),
        getCacheTag(["quotePreview", id].join("-")),
      ])
      tags.forEach((tag) => revalidateTag(tag, { expire: 0 }))
    })
}
