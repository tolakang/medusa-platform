import { sdk } from "@lib/config"
import { NextRequest, NextResponse } from "next/server"

// Product search for the browser. Each seller's shop must list only that
// seller's products, so the search has to carry the seller's publishable key,
// which this server resolves from the request's host (lib/data/seller.ts,
// added by the sdk wrapper in lib/config.ts). Calling the backend straight from
// the browser on a seller's domain is also blocked by CORS.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 })
  }

  try {
    const result = await sdk.client.fetch<unknown>("/store/search", {
      method: "POST",
      body: body as Record<string, unknown>,
      cache: "no-store",
    })
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (e) {
    const status = (e as { status?: number })?.status
    return NextResponse.json(
      { message: "Search failed" },
      { status: status && status >= 400 && status < 500 ? status : 502 }
    )
  }
}
