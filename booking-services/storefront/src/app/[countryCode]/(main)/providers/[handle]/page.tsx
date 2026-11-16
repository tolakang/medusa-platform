import { Metadata } from "next"
import { notFound } from "next/navigation"

import { listProducts } from "@lib/data/products"
import { getProvider } from "@lib/data/providers"
import { getRegion } from "@lib/data/regions"
import { SHOP_NAME } from "@lib/shop"
import { Heading, Text } from "@modules/common/components/ui"
import { ServiceCard } from "@modules/home/components/booking-kinds"

// A partner's public page (TASKS P3-32, plan §9.3 "Public provider page"):
// photo, about, area and their services, each with a Book button to its
// service page. Only approved partners have one.
type Props = { params: Promise<{ countryCode: string; handle: string }> }

const HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { handle } = await props.params
  const provider = HANDLE.test(handle) ? await getProvider(handle) : null
  if (!provider) {
    notFound()
  }
  return {
    title: `${provider.name} | ${SHOP_NAME}`,
    description: provider.bio ?? `Book ${provider.name} at ${SHOP_NAME}.`,
  }
}

export default async function ProviderPage(props: Props) {
  const { countryCode, handle } = await props.params
  const provider = HANDLE.test(handle) ? await getProvider(handle) : null
  const region = await getRegion(countryCode)
  if (!provider || !region) {
    notFound()
  }
  // Prices in this region, as on the home page.
  const products = provider.services.length
    ? (
        await listProducts({
          regionId: region.id,
          queryParams: { id: provider.services.map((s) => s.id), limit: provider.services.length },
        })
      ).response.products
    : []

  return (
    <div className="content-container flex flex-col gap-y-10 py-12" data-testid="provider-page">
      <div className="flex flex-col gap-6 small:flex-row small:items-center">
        {provider.photo && (
          // Any address the provider gives, so not next/image (its hosts are fixed at build time).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={provider.photo}
            alt={provider.name}
            className="h-32 w-32 rounded-full border border-ui-border-base object-cover"
          />
        )}
        <div className="flex flex-col gap-y-2">
          <Heading level="h1" className="text-3xl leading-10 text-ui-fg-base font-normal">
            {provider.name}
          </Heading>
          {provider.area && <Text className="text-ui-fg-subtle">{provider.area}</Text>}
          {provider.bio && <Text className="max-w-2xl whitespace-pre-line text-ui-fg-base">{provider.bio}</Text>}
        </div>
      </div>
      <section className="flex flex-col gap-y-6">
        <Heading level="h2" className="txt-xlarge text-ui-fg-base">
          Book {provider.name}
        </Heading>
        {products.length ? (
          <ul className="grid grid-cols-1 small:grid-cols-2 medium:grid-cols-3 gap-6">
            {products.map((product) => (
              <li key={product.id}>
                <ServiceCard product={product} />
              </li>
            ))}
          </ul>
        ) : (
          <Text className="text-ui-fg-subtle">Nothing to book yet.</Text>
        )}
      </section>
    </div>
  )
}
