"use client"

import { Heading } from "@medusajs/ui"
import { SHOP_NAME } from "@/lib/shop"
import Button from "@/modules/common/components/button"
import LocalizedClientLink from "@/modules/common/components/localized-client-link"
import Image from "next/image"

const Hero = () => {
  return (
    <div className="h-[75vh] w-full border-b border-ui-border-base relative bg-neutral-100">
      <Image
        src="/hero-image.jpg"
        alt=""
        layout="fill"
        quality={100}
        priority
      />
      <div className="absolute inset-0 z-1 flex flex-col justify-center items-center text-center small:p-32 gap-6">
        <span>
          <Heading
            level="h1"
            className="text-6xl leading-10 text-ui-fg-base font-normal mt-10 mb-5"
          >
            {SHOP_NAME}
          </Heading>

          <p className="leading-10 text-ui-fg-subtle font-normal text-lg">
            Wholesale prices for business buyers. Order online, ask for a quote.
          </p>
        </span>
        <LocalizedClientLink href="/store">
          <Button variant="secondary" className="rounded-2xl">
            Browse products
          </Button>
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default Hero
