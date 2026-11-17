import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Label, Select, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { sdk } from "../../lib/sdk"

// Trip zones (TASKS P3-21, plan D12 "zones"): the areas trips run between and,
// for each vehicle of a zone-priced trip service (product metadata
// trip_pricing "zones"), the price and length of a trip between two areas. A
// price counts both ways. Reads and writes /admin/booking/zones and
// /admin/booking/zone-prices.

type Zone = { id: string; name: string; rank: number }
type Price = { id: string; variant_id: string; from_zone_id: string; to_zone_id: string; amount: number; currency_code: string; minutes: number }
type Product = { id: string; title: string; metadata?: Record<string, unknown> | null; variants?: { id: string; title: string }[] }

const ZONES_KEY = ["booking-zones"]

const TripZonesPage = () => {
  const queryClient = useQueryClient()
  const [zoneName, setZoneName] = useState("")
  const [form, setForm] = useState({ variant_id: "", from: "", to: "", amount: "", minutes: "60" })

  const zones = useQuery({
    queryKey: ZONES_KEY,
    queryFn: () => sdk.client.fetch<{ zones: Zone[]; prices: Price[] }>("/admin/booking/zones"),
  })
  const products = useQuery({
    queryKey: ["trip-zone-products"],
    queryFn: () =>
      sdk.client.fetch<{ products: Product[] }>("/admin/products", {
        query: { fields: "id,title,metadata,variants.id,variants.title", limit: 100 },
      }),
  })
  const vehicles = useMemo(
    () =>
      (products.data?.products ?? [])
        .filter((p) => p.metadata?.booking_kind === "C" && p.metadata?.trip_pricing === "zones")
        .flatMap((p) => (p.variants ?? []).map((v) => ({ id: v.id, label: `${p.title} · ${v.title}` }))),
    [products.data]
  )
  const zoneName_ = (id: string) => zones.data?.zones.find((z) => z.id === id)?.name ?? "?"
  const refresh = () => queryClient.invalidateQueries({ queryKey: ZONES_KEY })
  const onError = (e: Error) => toast.error(e.message)

  const addZone = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/booking/zones", { method: "POST", body: { name: zoneName.trim(), rank: zones.data?.zones.length ?? 0 } }),
    onSuccess: () => {
      setZoneName("")
      refresh()
    },
    onError,
  })
  const removeZone = useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/booking/zones/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  })
  const setPrice = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/booking/zone-prices", {
        method: "POST",
        body: {
          variant_id: form.variant_id,
          from_zone_id: form.from,
          to_zone_id: form.to,
          amount: Number(form.amount),
          minutes: Number(form.minutes),
          currency_code: "usd",
        },
      }),
    onSuccess: () => {
      setForm({ ...form, from: "", to: "", amount: "" })
      refresh()
      toast.success("Price saved")
    },
    onError,
  })
  const removePrice = useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/booking/zone-prices/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  })

  const priceOk =
    !!form.variant_id &&
    !!form.from &&
    !!form.to &&
    form.from !== form.to &&
    Number(form.amount) >= 0 &&
    form.amount.trim() !== "" &&
    Number.isInteger(Number(form.minutes)) &&
    Number(form.minutes) >= 5
  const list = zones.data?.zones ?? []
  const prices = (zones.data?.prices ?? []).filter((p) => !form.variant_id || p.variant_id === form.variant_id)

  const zoneSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <div className="flex flex-col gap-y-1">
      <Label size="small">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <Select.Trigger>
          <Select.Value placeholder="Zone" />
        </Select.Trigger>
        <Select.Content>
          {list.map((z) => (
            <Select.Item key={z.id} value={z.id}>
              {z.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
  )

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Trip zones</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Areas for trips priced by zones (a product with Metadata booking_kind = C and trip_pricing = zones). Each
            vehicle has a price and a length for a trip between two areas; it counts both ways.
          </Text>
        </div>
        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="zone-name">
              New zone
            </Label>
            <Input id="zone-name" value={zoneName} placeholder="e.g. Airport" onChange={(e) => setZoneName(e.target.value)} />
          </div>
          <Button size="small" disabled={!zoneName.trim()} isLoading={addZone.isPending} onClick={() => addZone.mutate()}>
            Add zone
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 px-6 py-4">
          {list.map((z) => (
            <span key={z.id} className="flex items-center gap-x-2 rounded-md border border-ui-border-base px-2 py-1">
              <Text size="small">{z.name}</Text>
              <Button
                size="small"
                variant="transparent"
                onClick={() => window.confirm(`Delete ${z.name} and its prices?`) && removeZone.mutate(z.id)}
              >
                Delete
              </Button>
            </span>
          ))}
          {!list.length && <Text size="small" className="text-ui-fg-subtle">No zones yet.</Text>}
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Label size="small">Vehicle</Label>
            <Select value={form.variant_id} onValueChange={(v) => setForm({ ...form, variant_id: v })}>
              <Select.Trigger>
                <Select.Value placeholder="Choose a vehicle" />
              </Select.Trigger>
              <Select.Content>
                {vehicles.map((v) => (
                  <Select.Item key={v.id} value={v.id}>
                    {v.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          {zoneSelect(form.from, (v) => setForm({ ...form, from: v }), "From")}
          {zoneSelect(form.to, (v) => setForm({ ...form, to: v }), "To")}
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="zone-amount">
              Price (USD)
            </Label>
            <Input id="zone-amount" type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="zone-minutes">
              Minutes
            </Label>
            <Input id="zone-minutes" type="number" min={5} step={5} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
          </div>
          <Button size="small" disabled={!priceOk} isLoading={setPrice.isPending} onClick={() => setPrice.mutate()}>
            Save price
          </Button>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Vehicle</Table.HeaderCell>
              <Table.HeaderCell>Between</Table.HeaderCell>
              <Table.HeaderCell>Price</Table.HeaderCell>
              <Table.HeaderCell>Minutes</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {prices.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>{vehicles.find((v) => v.id === p.variant_id)?.label ?? p.variant_id}</Table.Cell>
                <Table.Cell>
                  {zoneName_(p.from_zone_id)} ↔ {zoneName_(p.to_zone_id)}
                </Table.Cell>
                <Table.Cell>
                  {Number(p.amount).toFixed(2)} {p.currency_code.toUpperCase()}
                </Table.Cell>
                <Table.Cell>{p.minutes}</Table.Cell>
                <Table.Cell>
                  <Button size="small" variant="secondary" onClick={() => removePrice.mutate(p.id)}>
                    Delete
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {!prices.length && (
          <Text size="small" className="text-ui-fg-subtle px-6 py-4">
            No prices{form.variant_id ? " for this vehicle" : ""} yet.
          </Text>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Trip zones",
})

export default TripZonesPage
