import React, { Suspense } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import { isServiceProduct, usesBookingPicker } from "@lib/util/booking"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ServiceReviews from "@modules/products/components/service-reviews"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  images,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  return (
    <>
      <div
        className="content-container  flex flex-col small:flex-row small:items-start py-6 relative"
        data-testid="product-container"
      >
        <div className="order-3 small:order-none flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-6">
          <ProductInfo product={product} />
          <ProductTabs product={product} />
        </div>
        <div className="order-1 small:order-none block w-full relative">
          <ImageGallery images={images} title={product.title} />
        </div>
        <div className="order-2 small:order-none flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-12">
          <ProductOnboardingCta />
          <Suspense
            fallback={
              // A service, ticket, rental, package or quote gets its own picker,
              // never "Add to cart" (P3-13), not even while it loads.
              usesBookingPicker(product) ? (
                <p className="txt-small text-ui-fg-subtle min-h-[12rem]" role="status">
                  {isServiceProduct(product) ? "Loading times…" : "Loading…"}
                </p>
              ) : (
                <ProductActions
                  disabled={true}
                  product={product}
                  region={region}
                />
              )
            }
          >
            <ProductActionsWrapper id={product.id} region={region} />
          </Suspense>
        </div>
      </div>
      {isServiceProduct(product) && (
        <div className="content-container mt-8 max-w-3xl">
          <Suspense fallback={null}>
            <ServiceReviews productId={product.id} />
          </Suspense>
        </div>
      )}
      <div
        className="content-container my-16 small:my-32"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
