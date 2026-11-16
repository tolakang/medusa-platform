// The product search index, from the shared core (BUILD_PLAN.md §4.1, §4.2 Search).
// Medusa's loader imports every file in src/search; importing this one runs the
// core's defineSearchIndex once, which registers the index (name "product").
export { default } from "@medusa-platform/medusa-core/search/product"
