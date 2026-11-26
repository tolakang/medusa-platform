import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { publicOrigin, publicUrl } from "../public-url.ts"

const h = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null })
const BIND = "http://0.0.0.0:3000/products"

describe("public redirect URL", () => {
  it("prefers the configured base URL", () => {
    assert.equal(publicOrigin(BIND, h({ host: "0.0.0.0:3000" }), { NEXT_PUBLIC_BASE_URL: "https://providers.shop.com/" }), "https://providers.shop.com")
    assert.equal(publicOrigin(BIND, h({}), { PROVIDER_PORTAL_URL: "https://p.shop.com" }), "https://p.shop.com")
  })

  it("uses the proxy's forwarded host and proto, never the bind address", () => {
    assert.equal(
      publicUrl("/login", BIND, h({ host: "0.0.0.0:3000", "x-forwarded-host": "providers.shop.com", "x-forwarded-proto": "https" }), {}).href,
      "https://providers.shop.com/login"
    )
    assert.equal(publicOrigin(BIND, h({ host: "providers.shop.com" }), {}), "http://providers.shop.com")
    assert.equal(publicOrigin(BIND, h({ host: "0.0.0.0:3000" }), {}), "http://0.0.0.0:3000")
  })
})
