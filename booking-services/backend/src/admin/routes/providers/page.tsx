import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Select, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

// Providers (TASKS P3-31, BUILD_PLAN §9.3 "Providers"): invite staff for a
// staff resource and give them the invite code, approve or suspend partners,
// set a partner's commission rate. Reads and writes /admin/booking/providers.

type Provider = {
  id: string
  role: "staff" | "partner"
  status: "invited" | "pending" | "active" | "suspended"
  email: string
  name: string
  handle: string
  commission_rate: number | null
  invite_code?: string
  resources?: { id: string; name: string; type: string }[]
}
type Resource = { id: string; name: string; type: string; provider_id?: string | null }

const QUERY_KEY = ["booking-providers"]
const NEW_RESOURCE = "new"

const STATUS: Record<Provider["status"], { label: string; color: "green" | "orange" | "grey" | "red" }> = {
  invited: { label: "Invited", color: "orange" },
  pending: { label: "Waiting for approval", color: "orange" },
  active: { label: "Active", color: "green" },
  suspended: { label: "Suspended", color: "red" },
}

const ProvidersPage = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: "", email: "", resource_id: NEW_RESOURCE })
  const [rate, setRate] = useState<{ id: string; value: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => sdk.client.fetch<{ providers: Provider[] }>("/admin/booking/providers"),
  })
  const providers = data?.providers ?? []
  const { data: resourceData } = useQuery({
    queryKey: ["booking-resources-for-providers"],
    queryFn: () => sdk.client.fetch<{ resources: Resource[] }>("/admin/booking/resources"),
  })
  // Staff resources nobody signs in for yet.
  const owned = new Set(providers.flatMap((p) => (p.resources ?? []).map((r) => r.id)))
  const freeStaff = (resourceData?.resources ?? []).filter((r) => r.type === "staff" && !owned.has(r.id))

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: ["booking-resources-for-providers"] })
  }

  const invite = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ provider: Provider }>("/admin/booking/providers", {
        method: "POST",
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          ...(form.resource_id !== NEW_RESOURCE ? { resource_id: form.resource_id } : {}),
        },
      }),
    onSuccess: ({ provider }) => {
      setForm({ name: "", email: "", resource_id: NEW_RESOURCE })
      refresh()
      toast.success(`${provider.name} invited`, {
        description: `Invite code: ${provider.invite_code}`,
        duration: 30000,
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: "active" | "suspended"; commission_rate?: number | null }) =>
      sdk.client.fetch<{ provider: Provider }>(`/admin/booking/providers/${id}`, { method: "POST", body }),
    onSuccess: ({ provider }) => {
      setRate(null)
      refresh()
      toast.success(`${provider.name} saved`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const canInvite = !!form.name.trim() && /\S+@\S+\.\S+/.test(form.email.trim())
  const rateValue = rate ? (rate.value.trim() === "" ? null : Number(rate.value)) : undefined
  const rateValid = rateValue === null || (typeof rateValue === "number" && rateValue >= 0 && rateValue <= 100)

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Providers</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Staff are invited here for their calendar: give them the invite code; they register in the provider portal
            with this email, the code and a new password, then confirm their email. Partners sign up on their own and
            show nothing in the shop until you approve them.
          </Text>
        </div>
        <form
          className="flex flex-wrap items-end gap-3 px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canInvite) invite.mutate()
          }}
        >
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="staff-name">
              Name
            </Label>
            <Input id="staff-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="staff-email">
              Email
            </Label>
            <Input
              id="staff-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">Calendar</Label>
            <Select value={form.resource_id} onValueChange={(v) => setForm({ ...form, resource_id: v })}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={NEW_RESOURCE}>New staff calendar</Select.Item>
                {freeStaff.map((r) => (
                  <Select.Item key={r.id} value={r.id}>
                    {r.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <Button type="submit" size="small" disabled={!canInvite} isLoading={invite.isPending}>
            Invite staff
          </Button>
        </form>
      </Container>

      <Container className="divide-y p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Role</Table.HeaderCell>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Calendar</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Commission</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {providers.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>{p.name}</Table.Cell>
                <Table.Cell>{p.role === "staff" ? "Staff" : "Partner"}</Table.Cell>
                <Table.Cell>{p.email}</Table.Cell>
                <Table.Cell>{(p.resources ?? []).map((r) => r.name).join(", ") || "-"}</Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col gap-y-1">
                    <Badge size="2xsmall" color={STATUS[p.status].color}>
                      {STATUS[p.status].label}
                    </Badge>
                    {p.invite_code && <span className="font-mono text-ui-fg-subtle">{p.invite_code}</span>}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  {p.role !== "partner" ? (
                    "-"
                  ) : rate?.id === p.id ? (
                    <Input
                      size="small"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Default"
                      aria-label="Commission in percent"
                      value={rate.value}
                      onChange={(e) => setRate({ id: p.id, value: e.target.value })}
                    />
                  ) : p.commission_rate === null ? (
                    "Default"
                  ) : (
                    `${p.commission_rate}%`
                  )}
                </Table.Cell>
                <Table.Cell>
                  <div className="flex justify-end gap-x-2">
                    {rate?.id === p.id ? (
                      <>
                        <Button
                          size="small"
                          disabled={!rateValid}
                          isLoading={update.isPending}
                          onClick={() => update.mutate({ id: p.id, commission_rate: rateValue ?? null })}
                        >
                          Save
                        </Button>
                        <Button size="small" variant="secondary" onClick={() => setRate(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        {p.role === "partner" && (
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => setRate({ id: p.id, value: p.commission_rate?.toString() ?? "" })}
                          >
                            Set rate
                          </Button>
                        )}
                        {p.status === "pending" && (
                          <Button
                            size="small"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: p.id, status: "active" })}
                          >
                            Approve
                          </Button>
                        )}
                        {p.status === "active" && (
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: p.id, status: "suspended" })}
                          >
                            Suspend
                          </Button>
                        )}
                        {p.status === "suspended" && (
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: p.id, status: "active" })}
                          >
                            Reactivate
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {!isLoading && !providers.length && (
          <Text size="small" className="text-ui-fg-subtle px-6 py-4">
            {error ? `Couldn't load the providers: ${(error as Error).message}` : "No providers yet. Invite staff above."}
          </Text>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Providers",
})

export default ProvidersPage
