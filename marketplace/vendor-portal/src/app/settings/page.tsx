import { Shell } from "@/components/shell"
import { requireVendor } from "@/lib/server/vendor"
import { SettingsForm } from "./settings-form"

// Shop settings (gap review 2026-11-24): name and logo. The shop address
// stays the same so links keep working.
export default async function SettingsPage() {
  const { vendor } = await requireVendor()
  return (
    <Shell vendor={vendor} active="/settings">
      <SettingsForm name={vendor.name} logo={vendor.logo} handle={vendor.handle} details={vendor} />
    </Shell>
  )
}
