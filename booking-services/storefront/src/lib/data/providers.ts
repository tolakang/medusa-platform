import { sdk } from "@lib/config"
import { CATALOG_REVALIDATE_SECONDS } from "@lib/catalog-cache"
import { getCacheOptions } from "./cookies"

// An approved partner's public page (TASKS P3-32, plan §9.3 "Public provider
// page"): GET /store/booking/providers/:handle. Null when there is no such
// page (unknown, staff, pending or suspended: the backend answers 404).
export type PublicProvider = {
  handle: string
  name: string
  bio: string | null
  photo: string | null
  area: string | null
  services: { id: string; handle: string; title: string; description: string | null; thumbnail: string | null }[]
}

export async function getProvider(handle: string): Promise<PublicProvider | null> {
  const next = { ...(await getCacheOptions("providers")), revalidate: CATALOG_REVALIDATE_SECONDS }
  return sdk.client
    .fetch<{ provider: PublicProvider }>(`/store/booking/providers/${encodeURIComponent(handle)}`, {
      next,
      cache: "force-cache",
    })
    .then((r) => r.provider)
    .catch((e) => {
      if (e?.status === 404) {
        return null
      }
      throw e
    })
}
