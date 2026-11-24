import { Shell } from "@/components/shell"
import { requireSeller } from "@/lib/server/seller"
import { SettingsForm } from "./settings-form"

// Settings (gap review 2026-11-24): the shop name. The domain is set by the shop owner.
export default async function SettingsPage() {
  const { seller } = await requireSeller()
  return (
    <Shell seller={seller} active="/settings">
      <SettingsForm name={seller.name} domain={seller.domain} />
    </Shell>
  )
}
