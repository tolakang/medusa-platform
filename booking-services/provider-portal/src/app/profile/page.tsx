import { Shell } from "@/components/shell"
import { requireProvider } from "@/lib/server/provider"
import { ProfileForm } from "./form"

// TASKS P3-32: the provider's own profile. Partners also see their
// commission rate; staff never see money.
export default async function ProfilePage() {
  const { provider } = await requireProvider()
  return (
    <Shell provider={provider} active="/profile">
      <section className="card p-4">
        <p className="mb-3 text-sm text-ui-fg-subtle">
          Signed in as {provider.email}
          {provider.role === "partner"
            ? ` · commission ${provider.commission_rate == null ? "at the shop's default rate" : `${provider.commission_rate}%`}`
            : ""}
        </p>
        <ProfileForm provider={provider} />
      </section>
    </Shell>
  )
}
