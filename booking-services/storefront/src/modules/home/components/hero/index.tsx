import { SHOP_NAME } from "@lib/shop"
import { Heading } from "@modules/common/components/ui"

// Home page opening for the booking-only shop (TASKS P3-19, plan §9.3).
const Hero = () => {
  return (
    <div className="w-full border-b border-ui-border-base bg-ui-bg-subtle">
      <div className="content-container flex flex-col items-center text-center gap-4 py-24 small:py-32">
        <Heading level="h1" className="text-3xl leading-10 text-ui-fg-base font-normal">
          {SHOP_NAME}
        </Heading>
        <Heading level="h2" className="text-xl leading-8 text-ui-fg-subtle font-normal">
          Choose a service, pick a free time and book it online.
        </Heading>
      </div>
    </div>
  )
}

export default Hero
