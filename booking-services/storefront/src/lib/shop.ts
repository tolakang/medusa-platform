// The shop's name in the header, footer, page titles and emails' sign-up text
// (TASKS P3-19). Set at build time with NEXT_PUBLIC_SHOP_NAME (a Dokploy
// build-time argument); without it, a neutral booking name.
export const SHOP_NAME = process.env.NEXT_PUBLIC_SHOP_NAME?.trim() || "Book Online"
