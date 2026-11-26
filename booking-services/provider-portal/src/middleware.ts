import { NextResponse, type NextRequest } from "next/server"
import { publicUrl } from "@/lib/public-url"

// Pages need a session cookie (TASKS P3-32, as the vendor portal); without one, go
// to sign-in. The cookie's content is checked server-side (lib/server).
export function middleware(req: NextRequest) {
  if (!req.cookies.has("provider_session")) {
    return NextResponse.redirect(publicUrl("/login", req.url, req.headers))
  }
  return NextResponse.next()
}

export const config = {
  // verify-account: the emailed link works without a session (TASKS P3-31).
  matcher: ["/((?!login|logout|verify-account|reset-password|_next|favicon.ico).*)"],
}
