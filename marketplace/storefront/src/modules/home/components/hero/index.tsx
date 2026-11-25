import { SHOP_NAME } from "@lib/shop"
import { Button, Heading } from "@modules/common/components/ui";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
const Hero = () => {
  return (
    <div className="h-[260px] small:h-[75vh] w-full border-b border-ui-border-base relative bg-ui-bg-subtle">
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center p-6 small:p-32 gap-4 small:gap-6">
        <span>
          <Heading
            level="h1"
            className="text-2xl small:text-3xl leading-8 small:leading-10 text-ui-fg-base font-normal"
          >
            {SHOP_NAME}
          </Heading>
          <Heading
            level="h2"
            className="text-xl small:text-3xl leading-7 small:leading-10 text-ui-fg-subtle font-normal"
          >
            Browse the shop and order online.
          </Heading>
        </span>
        <LocalizedClientLink href="/store">
          <Button variant="secondary">Shop all products</Button>
        </LocalizedClientLink>
      </div>
    </div>
  );
};

export default Hero;
