import { Shell } from "@/components/shell"
import { money } from "@/lib/format"
import { providerGet, requirePartner } from "@/lib/server/provider"
import { AddServiceForm, PriceForm, VisibilityButton } from "./forms"

type Service = {
  id: string
  title: string
  description: string | null
  status: string
  variants: { id: string; title: string; prices: { amount: number; currency_code: string }[] }[]
}

// TASKS P3-32: a partner's own services: lengths and prices, shown or hidden
// in the shop, and a form to add one.
export default async function ServicesPage() {
  const { token, provider } = await requirePartner()
  if (provider.status !== "active") {
    return <Shell provider={provider} active="/services">{null}</Shell>
  }
  const { services } = await providerGet<{ services: Service[] }>(token, "/providers/me/services")
  const currency = services[0]?.variants[0]?.prices[0]?.currency_code ?? "usd"
  return (
    <Shell provider={provider} active="/services">
      {services.map((s) => (
        <section key={s.id} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{s.title}</h2>
              <p className="text-sm text-ui-fg-subtle">{s.status === "published" ? "In the shop" : "Hidden from the shop"}</p>
              {s.description && <p className="mt-1 text-sm">{s.description}</p>}
            </div>
            <VisibilityButton serviceId={s.id} published={s.status === "published"} />
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {s.variants.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {v.title} · {money(v.prices[0]?.amount, v.prices[0]?.currency_code ?? currency)}
                </span>
                <PriceForm serviceId={s.id} variantId={v.id} price={v.prices[0]?.amount ?? 0} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!services.length && <p className="text-sm text-ui-fg-subtle">No services yet. Add your first one below.</p>}
      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Add a service</h2>
        <AddServiceForm currency={currency} />
      </section>
    </Shell>
  )
}
