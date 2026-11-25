import compareAddresses from "@/lib/util/compare-addresses"
import AddressSelect from "@/modules/checkout/components/address-select"
import CheckboxWithLabel from "@/modules/common/components/checkbox"
import CountrySelect from "@/modules/checkout/components/country-select"
import Input from "@/modules/common/components/input"
import { B2BCart, B2BCustomer } from "@/types"
import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import { mapKeys } from "lodash"
import React, { useEffect, useMemo, useState } from "react"

const ShippingAddressForm = ({
  customer,
  cart,
}: {
  customer: B2BCustomer | null
  cart: B2BCart | null
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({
    "shipping_address.first_name": "",
    "shipping_address.last_name": "",
    "shipping_address.address_1": "",
    "shipping_address.company": cart?.company?.name || "",
    "shipping_address.postal_code": "",
    "shipping_address.city": "",
    "shipping_address.country_code": "",
    "shipping_address.province": "",
    "shipping_address.phone": "",
    email: "",
  })

  const countriesInRegion = useMemo(
    () => cart?.region?.countries?.map((c) => c.iso_2),
    [cart?.region]
  )

  // check if customer has saved addresses that are in the current region
  const addressesInRegion = useMemo(
    () =>
      customer?.addresses.filter(
        (a) => a.country_code && countriesInRegion?.includes(a.country_code)
      ),
    [customer?.addresses, countriesInRegion]
  )

  const setFormAddress = (
    address?: HttpTypes.StoreCartAddress,
    email?: string
  ) => {
    address &&
      setFormData((prevState: Record<string, any>) => ({
        ...prevState,
        "shipping_address.first_name": address?.first_name?.toString() || "",
        "shipping_address.last_name": address?.last_name?.toString() || "",
        "shipping_address.address_1": address?.address_1?.toString() || "",
        "shipping_address.company": address?.company?.toString() || "",
        "shipping_address.postal_code": address?.postal_code?.toString() || "",
        "shipping_address.city": address?.city?.toString() || "",
        "shipping_address.country_code":
          address?.country_code?.toString() || "",
        "shipping_address.province": address?.province?.toString() || "",
        "shipping_address.phone": address?.phone?.toString() || "",
      }))

    email &&
      setFormData((prevState: Record<string, any>) => ({
        ...prevState,
        email: email.toString() || "",
      }))
  }

  useEffect(() => {
    if (cart && cart.shipping_address) {
      setFormAddress(cart?.shipping_address)
      return
    }
    // Polish 2026-11-25: a cart with no address yet starts from the
    // company's address (the buyer can still pick a saved one or edit).
    const company = cart?.company
    if (company?.address) {
      const country = company.country?.toLowerCase() ?? ""
      setFormAddress({
        first_name: customer?.first_name ?? "",
        last_name: customer?.last_name ?? "",
        phone: customer?.phone ?? company.phone ?? "",
        company: company.name ?? "",
        address_1: company.address ?? "",
        city: company.city ?? "",
        postal_code: company.zip ?? "",
        province: company.state ?? "",
        // Only a country this region ships to; otherwise the buyer picks.
        country_code: countriesInRegion?.includes(country) ? country : "",
      } as HttpTypes.StoreCartAddress)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart])

  // "Billing same as shipping" starts on only when that loses nothing: no
  // billing address yet, or one equal to the shipping address. On submit
  // the billing address is set to the shipping address (setShippingAddress).
  const [sameAsBilling, setSameAsBilling] = useState(
    !cart?.billing_address?.address_1 ||
      (!!cart?.shipping_address &&
        compareAddresses(cart.shipping_address, cart.billing_address))
  )

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLInputElement | HTMLSelectElement
    >
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <>
      {customer && (addressesInRegion?.length || 0) > 0 && (
        <Container className="mb-6 flex flex-col gap-y-4 p-5">
          <p className="text-small-regular">
            {`Hi ${customer.first_name}, do you want to use one of your saved addresses?`}
          </p>
          <AddressSelect
            addresses={customer.addresses}
            addressInput={
              mapKeys(formData, (_, key) =>
                key.replace("shipping_address.", "")
              ) as HttpTypes.StoreCartAddress
            }
            onSelect={setFormAddress}
          />
        </Container>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="First name"
          name="shipping_address.first_name"
          autoComplete="given-name"
          value={formData["shipping_address.first_name"]}
          onChange={handleChange}
          required
          data-testid="shipping-first-name-input"
        />
        <Input
          label="Last name"
          name="shipping_address.last_name"
          autoComplete="family-name"
          value={formData["shipping_address.last_name"]}
          onChange={handleChange}
          required
          data-testid="shipping-last-name-input"
        />
        <Input
          label="Phone"
          name="shipping_address.phone"
          autoComplete="tel"
          value={formData["shipping_address.phone"]}
          onChange={handleChange}
          required
          data-testid="shipping-phone-input"
        />
        <Input
          label="Company name"
          name="shipping_address.company"
          value={formData["shipping_address.company"]}
          onChange={handleChange}
          autoComplete="organization"
          data-testid="shipping-company-input"
          colSpan={2}
        />
        <Input
          label="Address"
          name="shipping_address.address_1"
          autoComplete="address-line1"
          value={formData["shipping_address.address_1"]}
          onChange={handleChange}
          required
          data-testid="shipping-address-input"
          colSpan={2}
        />
        <Input
          label="Postal code"
          name="shipping_address.postal_code"
          autoComplete="postal-code"
          value={formData["shipping_address.postal_code"]}
          onChange={handleChange}
          required
          data-testid="shipping-postal-code-input"
          colSpan={2}
        />
        <div className="grid small:grid-cols-3 grid-cols-2 gap-4 col-span-2">
          <Input
            label="City"
            name="shipping_address.city"
            autoComplete="address-level2"
            value={formData["shipping_address.city"]}
            onChange={handleChange}
            required
            data-testid="shipping-city-input"
          />
          {/* Province is optional for shipping and billing alike. */}
          <Input
            label="Province"
            name="shipping_address.province"
            autoComplete="address-level1"
            value={formData["shipping_address.province"]}
            onChange={handleChange}
            data-testid="shipping-province-input"
          />
          <CountrySelect
            className="col-span-2"
            name="shipping_address.country_code"
            autoComplete="country"
            region={cart?.region}
            value={formData["shipping_address.country_code"]}
            onChange={handleChange}
            required
            data-testid="shipping-country-select"
          />
        </div>
      </div>
      <div className="mt-4">
        <CheckboxWithLabel
          label="Billing address same as shipping address"
          checked={sameAsBilling}
          onChange={() => setSameAsBilling((v) => !v)}
          data-testid="shipping-same-as-billing-checkbox"
        />
        <input
          type="hidden"
          name="same_as_billing"
          value={sameAsBilling ? "on" : "off"}
        />
      </div>
    </>
  )
}

export default ShippingAddressForm
