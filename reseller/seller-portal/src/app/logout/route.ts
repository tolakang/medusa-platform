import { NextRequest, NextResponse } from "next/server"
import { publicUrl } from "@/lib/public-url"

// TASKS P5-08: clears the session and opens sign-in (pages can't change
// cookies while rendering, so they send the seller here).
//
// A link or image on another site must not sign a seller out (REVIEW_FIXES
// C6): a cross-site request goes to the home page and keeps the session.
// Pages of this app redirect here same-origin, and so does a typed URL.
export function GET(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.redirect(publicUrl("/", request.url, request.headers), 303)
  }
  const response = NextResponse.redirect(publicUrl("/login", request.url, request.headers), 303)
  response.cookies.delete("seller_session")
  return response
}
