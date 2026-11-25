import { SHOP_NAME } from "@lib/shop"
import { Metadata } from "next"

import { listVendors } from "@lib/data/vendors"
import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// The shop directory (bug 2026-11-25: /<country>/vendors was a 404): every
// active vendor with its logo, linking to its shop page. GET /store/vendors.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: `Shops | ${SHOP_NAME}`,
  description: "Every shop selling on this marketplace.",
}

export default async function VendorsPage() {
  const vendors = await listVendors()
  return (
    <div className="content-container py-6" data-testid="vendors-container">
      <Heading level="h1" className="text-2xl-semi mb-6">
        Shops
      </Heading>
      {vendors.length ? (
        <ul className="grid grid-cols-2 gap-4 small:grid-cols-4">
          {vendors.map((v) => (
            <li key={v.id}>
              <LocalizedClientLink
                href={`/vendors/${v.handle}`}
                className="flex flex-col items-center gap-3 rounded-lg border border-ui-border-base p-4 hover:shadow-elevation-card-hover"
              >
                {v.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.logo} alt="" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-ui-bg-subtle text-xl-semi text-ui-fg-subtle"
                  >
                    {v.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <Text className="text-center font-medium">{v.name}</Text>
              </LocalizedClientLink>
            </li>
          ))}
        </ul>
      ) : (
        <Text className="text-ui-fg-subtle">No shops yet.</Text>
      )}
    </div>
  )
}
