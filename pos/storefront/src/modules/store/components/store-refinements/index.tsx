"use client"

import clsx from "clsx"
import { useState } from "react"
import { useSortBy } from "react-instantsearch"

import FilterRadioGroup from "@modules/common/components/filter-radio-group"
import {
  CATEGORY_ATTRIBUTE,
  LABELS_ATTRIBUTE,
  getSortOptions,
} from "./attributes"
import CurrentRefinements from "./current-refinements"
import OnSaleToggle from "./on-sale-toggle"
import OptionRefinements from "./option-refinements"
import PriceRange from "./price-range"
import RefinementGroup from "./refinement-group"

const SortProducts = ({ currencyCode }: { currencyCode: string }) => {
  const items = getSortOptions(currencyCode)
  const { currentRefinement, refine } = useSortBy({ items })

  return (
    <FilterRadioGroup
      title="Sort by"
      items={items}
      value={currentRefinement}
      handleChange={refine}
      data-testid="sort-by-container"
    />
  )
}

const StoreRefinements = ({ currencyCode }: { currencyCode: string }) => {
  // On phones the filters sit behind a button so the products come first
  // (role test 2026-11-25); from `small` up they are a sidebar as before.
  const [open, setOpen] = useState(false)

  return (
    <div className="small:w-[250px] small:shrink-0 small:ml-[1.675rem]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="store-filters"
        className="small:hidden mb-4 w-full rounded-md border border-ui-border-base px-4 py-2 text-left txt-compact-small-plus"
        data-testid="store-filters-toggle"
      >
        {open ? "Hide filters" : "Sort & filter"}
      </button>
      <div
        id="store-filters"
        className={clsx(
          "flex-col gap-12 py-4 mb-8 small:px-0 small:flex",
          open ? "flex" : "hidden"
        )}
      >
      <SortProducts currencyCode={currencyCode} />
      <CurrentRefinements currencyCode={currencyCode} />
      <OptionRefinements />
      <PriceRange currencyCode={currencyCode} />
      <OnSaleToggle currencyCode={currencyCode} />
      <RefinementGroup attribute={CATEGORY_ATTRIBUTE} title="Category" />
      <RefinementGroup attribute={LABELS_ATTRIBUTE} title="Labels" />
      </div>
    </div>
  )
}

export default StoreRefinements
