// The shop's name in the header, footer and page titles (design critique,
// 2026-11-23; as the booking storefront). Set at build time with
// NEXT_PUBLIC_SHOP_NAME (a Dokploy build-time argument); without it, a
// neutral name.
export const SHOP_NAME = process.env.NEXT_PUBLIC_SHOP_NAME?.trim() || "Wholesale"
