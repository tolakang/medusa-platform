// Same helper as reseller/seller-portal (PR #108); the portals share no code.
// The portal's public address for redirects. Behind Traefik the server binds
// 0.0.0.0:3000, so `request.url` names that bind address and a redirect built
// from it sent signed-out providers to http://0.0.0.0:3000/login. Order: the
// configured NEXT_PUBLIC_BASE_URL (or PROVIDER_PORTAL_URL), else the proxy's
// X-Forwarded-Host/Proto, else the Host header, else the request URL.
// Pure, so it is unit tested (src/lib/__tests__/public-url.test.ts).

type HeaderReader = { get(name: string): string | null }

const first = (value: string | null) => value?.split(",")[0]?.trim() || null

export function publicOrigin(
  requestUrl: string,
  headers: HeaderReader,
  env: Record<string, string | undefined> = process.env
): string {
  for (const configured of [env.NEXT_PUBLIC_BASE_URL, env.PROVIDER_PORTAL_URL]) {
    const value = configured?.trim()
    if (value) {
      try {
        return new URL(value).origin
      } catch {
        // Not a URL: try the next source.
      }
    }
  }
  const fallback = new URL(requestUrl)
  const host = first(headers.get("x-forwarded-host")) ?? first(headers.get("host"))
  if (!host || /^0\.0\.0\.0(:|$)/.test(host)) {
    return fallback.origin
  }
  const proto = first(headers.get("x-forwarded-proto")) ?? fallback.protocol.replace(":", "")
  return `${proto === "https" ? "https" : "http"}://${host}`
}

export const publicUrl = (
  path: string,
  requestUrl: string,
  headers: HeaderReader,
  env: Record<string, string | undefined> = process.env
) => new URL(path, publicOrigin(requestUrl, headers, env))
