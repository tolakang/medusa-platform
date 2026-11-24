import { Shell } from "@/components/shell"
import { money } from "@/lib/format"
import { providerGet, requirePartner } from "@/lib/server/provider"
import { AddPackageForm, EditPackageForm, type Choice } from "./forms"

type Service = { id: string; title: string; variants: { id: string; title: string; prices: { amount: number; currency_code: string }[] }[] }
type Package = {
  id: string
  title: string
  status: string
  pieces: { variant_id?: string; time?: string; label?: string }[]
  price: { amount: number; currency_code: string } | null
}

// TASKS P3-30 (plan §9.3: partners build "packages from their own pieces"):
// a partner's event packages and a form to add one from their own services.
export default async function PackagesPage() {
  const { token, provider } = await requirePartner()
  if (provider.status !== "active") {
    return <Shell provider={provider} active="/packages">{null}</Shell>
  }
  const [{ services }, { packages }] = await Promise.all([
    providerGet<{ services: Service[] }>(token, "/providers/me/services"),
    providerGet<{ packages: Package[] }>(token, "/providers/me/packages"),
  ])
  const choices: Choice[] = services.flatMap((s) => s.variants.map((v) => ({ variant_id: v.id, label: `${s.title} · ${v.title}` })))
  const nameOf = new Map(choices.map((c) => [c.variant_id, c.label]))
  const currency = services[0]?.variants[0]?.prices[0]?.currency_code ?? "usd"
  return (
    <Shell provider={provider} active="/packages">
      {packages.map((p) => (
        <section key={p.id} className="card p-4">
          <h2 className="font-semibold">{p.title}</h2>
          <p className="text-sm text-ui-fg-subtle">
            {p.price ? money(p.price.amount, p.price.currency_code) : ""} · {p.status === "published" ? "In the shop" : "Hidden from the shop"}
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {p.pieces.map((x, i) => (
              <li key={i}>
                {x.time} · {x.label ?? nameOf.get(x.variant_id ?? "") ?? "Part"}
              </li>
            ))}
          </ul>
          <EditPackageForm pkg={p} />
        </section>
      ))}
      {!packages.length && <p className="text-sm text-ui-fg-subtle">No packages yet. Put several of your services together below.</p>}
      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Add a package</h2>
        {choices.length ? (
          <AddPackageForm choices={choices} currency={currency} />
        ) : (
          <p className="text-sm text-ui-fg-subtle">Add a service first; a package is made of your services.</p>
        )}
      </section>
    </Shell>
  )
}
