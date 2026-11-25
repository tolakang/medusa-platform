// The shop's name in the header, footer and page titles (design critique,
// 2026-11-23; as the booking storefront). Set at build time with
// NEXT_PUBLIC_SHOP_NAME (a Dokploy build-time argument); without it, a
// neutral name.
export const SHOP_NAME = process.env.NEXT_PUBLIC_SHOP_NAME?.trim() || "Online Shop"

// How the manual payment (pp_system_default) is named at checkout and on the
// order (ui-compare, 2026-11-25): "Manual Payment" meant nothing to shoppers.
// Set NEXT_PUBLIC_MANUAL_PAYMENT_LABEL at build time to the shop's own words.
export const MANUAL_PAYMENT_LABEL =
  process.env.NEXT_PUBLIC_MANUAL_PAYMENT_LABEL?.trim() || "Pay later (cash or bank transfer)"

// Where a shopper asks for help (Telegram, mailto: or a page), shown on the
// order pages, guests included. Unset: no contact link.
export const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL?.trim() || null
