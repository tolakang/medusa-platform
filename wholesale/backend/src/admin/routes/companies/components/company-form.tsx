import { Button, Drawer, Input, Label, Select, Text } from "@medusajs/ui";
import { AdminUpdateCompany } from "../../../../types";
import { useState } from "react";
import { useRegions } from "../../../hooks/api";

const PAYMENT_TERMS = [
  { value: "prepaid", label: "Prepaid" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_60", label: "Net 60" },
];

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "suspended", label: "Suspended" },
];

export function CompanyForm({
  company,
  handleSubmit,
  loading,
  error,
}: {
  company?: AdminUpdateCompany;
  handleSubmit: (data: AdminUpdateCompany) => Promise<void>;
  loading: boolean;
  error: Error | null;
}) {
  const [formData, setFormData] = useState<AdminUpdateCompany>(
    company || ({} as AdminUpdateCompany)
  );

  const { regions, isPending: regionsLoading } = useRegions();

  const currencyCodes = regions?.map((region) => region.currency_code);
  const countries = regions?.flatMap((region) => region.countries);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCurrencyChange = (value: string) => {
    setFormData({ ...formData, currency_code: value });
  };

  // Older storefront sign-ups saved the country's name ("Denmark"): match
  // it to its ISO 2 code, which Save then stores.
  const countryIso = (value?: string | null) => {
    if (!value) {
      return "";
    }
    const wanted = value.toLowerCase();
    const match = countries?.find((country) =>
      [country?.iso_2, country?.name, country?.display_name].some(
        (v) => !!v && String(v).toLowerCase() === wanted
      )
    );
    return match?.iso_2 || value;
  };

  const handleCountryChange = (value: string) => {
    setFormData({ ...formData, country: value });
  };

  // P4-02: an empty credit limit means "no limit set" (null).
  const handleCreditLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({
      ...formData,
      credit_limit: value === "" ? null : Number(value),
    });
  };

  return (
    // The body scrolls and the footer stays in view: at 1024x768 Save was
    // below the fold (role test 2026-11-25).
    <form className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Drawer.Body className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          <Label size="xsmall">Company Name</Label>
          <Input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Company name"
          />
          <Label size="xsmall">Company Phone</Label>
          <Input
            type="text"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="Phone number"
          />
          <Label size="xsmall">Company Email</Label>
          <Input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="orders@company.com"
          />
          <Label size="xsmall">Company Address</Label>
          <Input
            type="text"
            name="address"
            value={formData.address || ""}
            onChange={handleChange}
            placeholder="Street address"
          />
          <Label size="xsmall">Company City</Label>
          <Input
            type="text"
            name="city"
            value={formData.city || ""}
            onChange={handleChange}
            placeholder="City"
          />
          <Label size="xsmall">Company State</Label>
          <Input
            type="text"
            name="state"
            value={formData.state || ""}
            onChange={handleChange}
            placeholder="State / province"
          />
          <Label size="xsmall">Company Zip</Label>
          <Input
            type="text"
            name="zip"
            value={formData.zip || ""}
            onChange={handleChange}
            placeholder="Postal code"
          />
          <div className="flex gap-4 w-full">
            <div className="flex flex-col gap-2 w-1/2">
              <Label size="xsmall">Company Country</Label>
              <Select
                name="country"
                value={countryIso(formData.country)}
                onValueChange={handleCountryChange}
                disabled={regionsLoading}
              >
                <Select.Trigger disabled={regionsLoading}>
                  <Select.Value placeholder="Select a country" />
                </Select.Trigger>
                <Select.Content className="z-50">
                  {countries?.map((country) => (
                    <Select.Item
                      key={country?.iso_2 || ""}
                      value={country?.iso_2 || ""}
                    >
                      {country?.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-2 w-1/2">
              <Label size="xsmall">Currency</Label>

              <Select
                name="currency_code"
                value={formData.currency_code || ""}
                onValueChange={handleCurrencyChange}
                defaultValue={currencyCodes?.[0]}
                disabled={regionsLoading}
              >
                <Select.Trigger disabled={regionsLoading}>
                  <Select.Value placeholder="Select a currency" />
                </Select.Trigger>

                <Select.Content className="z-50">
                  {currencyCodes?.map((currencyCode) => (
                    <Select.Item key={currencyCode} value={currencyCode}>
                      {currencyCode.toUpperCase()}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>
          <Label size="xsmall">Tax ID</Label>
          <Input
            type="text"
            name="tax_id"
            value={formData.tax_id || ""}
            onChange={handleChange}
            placeholder="VAT / TIN"
          />
          <div className="flex gap-4 w-full">
            <div className="flex flex-col gap-2 w-1/2">
              <Label size="xsmall">Payment Terms</Label>
              <Select
                name="payment_terms"
                value={formData.payment_terms || "prepaid"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    payment_terms: value as AdminUpdateCompany["payment_terms"],
                  })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content className="z-50">
                  {PAYMENT_TERMS.map((terms) => (
                    <Select.Item key={terms.value} value={terms.value}>
                      {terms.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-2 w-1/2">
              <Label size="xsmall">Status</Label>
              <Select
                name="status"
                value={formData.status || "approved"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    status: value as AdminUpdateCompany["status"],
                  })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content className="z-50">
                  {STATUSES.map((status) => (
                    <Select.Item key={status.value} value={status.value}>
                      {status.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>
          <Label size="xsmall">Spending limits start again</Label>
          <Select
            name="spending_limit_reset_frequency"
            value={(formData as { spending_limit_reset_frequency?: string }).spending_limit_reset_frequency || "monthly"}
            onValueChange={(value) =>
              setFormData({ ...formData, spending_limit_reset_frequency: value } as typeof formData)
            }
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content className="z-50">
              {[
                ["never", "Never"],
                ["daily", "Every day"],
                ["weekly", "Every week"],
                ["monthly", "Every month"],
                ["yearly", "Every year"],
              ].map(([value, label]) => (
                <Select.Item key={value} value={value}>
                  {label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Label size="xsmall">Credit Limit (empty = no limit set)</Label>
          <Input
            type="number"
            min={0}
            name="credit_limit"
            value={formData.credit_limit ?? ""}
            onChange={handleCreditLimitChange}
            placeholder="5000"
          />
          {/* TODO: Add logo upload */}
          <Label size="xsmall">Company Logo URL</Label>
          <Input
            type="text"
            name="logo_url"
            value={formData.logo_url || ""}
            onChange={handleChange}
            placeholder="https://example.com/logo.png"
          />
        </div>
      </Drawer.Body>
      <Drawer.Footer className="shrink-0">
        <Drawer.Close asChild>
          <Button variant="secondary">Cancel</Button>
        </Drawer.Close>
        <Button
          isLoading={loading}
          onClick={async () =>
            await handleSubmit({
              ...formData,
              country: countryIso(formData.country) || formData.country,
            })
          }
        >
          Save
        </Button>
        {error && (
          <Text className="txt-compact-small text-ui-fg-warning">
            Error: {error?.message}
          </Text>
        )}
      </Drawer.Footer>
    </form>
  );
}
