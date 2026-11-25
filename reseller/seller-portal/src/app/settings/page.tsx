import { Shell } from "@/components/shell"
import { requireSeller } from "@/lib/server/seller"
import { PasswordForm, SettingsForm } from "./settings-form"

// Settings (gap review 2026-11-24; role test 2026-11-25): shop name, contact,
// payout account and password. The domain is set by the shop owner.
export default async function SettingsPage() {
  const { seller } = await requireSeller()
  return (
    <Shell seller={seller} active="/settings">
      <SettingsForm seller={seller} />
      <PasswordForm />
    </Shell>
  )
}
