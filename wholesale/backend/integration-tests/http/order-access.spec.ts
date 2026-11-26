import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ORDER_ACCESS_HEADER, signOrderAccess } from "@medusa-platform/medusa-core/api/order-access";
import { call, setupB2b } from "../utils/b2b";

// GET /store/orders/:id shows name, address and phone: only the buyer, an admin
// of the buyer's company, or the browser that placed it (signed proof the
// storefront forwards as x-order-access); everyone else gets 404
// (src/api/store/orders/middlewares.ts, packages/medusa-core/src/api/order-access.ts).
const SECRET = "test_order_access_secret";
process.env.ORDER_ACCESS_SECRET = SECRET;
jest.setTimeout(240 * 1000);

medusaIntegrationTestRunner({
  env: { JWT_SECRET: "supersecret" },
  testSuite: ({ api, getContainer }) => {
    describe("Store order access (wholesale)", () => {
      let b2b: Awaited<ReturnType<typeof setupB2b>>;

      beforeEach(async () => {
        b2b = await setupB2b(api, getContainer());
      });

      const proof = (orderId: string, exp = Math.floor(Date.now() / 1000) + 3600, secret = SECRET) =>
        `${exp}.${signOrderAccess(secret, orderId, exp)}`;

      it("the buyer and their company admin see the order; nobody else does without proof", async () => {
        const company = await b2b.company();
        const buyer = await b2b.employee(company.id);
        const { data } = await b2b.cart(buyer.token, 1);
        const { order } = await b2b.checkout(data.cart.id, buyer.token);
        const colleague = await b2b.employee(company.id);
        const admin = await b2b.employee(company.id, { is_admin: true });
        const other = await b2b.company();
        const otherAdmin = await b2b.employee(other.id, { is_admin: true });
        const path = `/store/orders/${order.id}`;
        const get = (headers: { headers: Record<string, string> }) => call(api.get(path, headers));

        const own = await get(b2b.store(buyer.token));
        expect(own.status).toEqual(200);
        expect(own.data.order.id).toEqual(order.id);
        expect((await get(b2b.store(admin.token))).status).toEqual(200);
        expect((await get(b2b.store(colleague.token))).status).toEqual(404);
        expect((await get(b2b.store(otherAdmin.token))).status).toEqual(404);

        // Guest without or with a bad proof: 404; with a valid proof: 200.
        const guest = b2b.store();
        const withProof = (p: string) => ({ headers: { ...guest.headers, [ORDER_ACCESS_HEADER]: p } });
        expect((await get(guest)).status).toEqual(404);
        expect((await get(withProof(proof(order.id, undefined, "wrong")))).status).toEqual(404);
        const ok = await get(withProof(proof(order.id)));
        expect(ok.status).toEqual(200);

        // A signed-in customer is judged by ownership alone: a valid proof another
        // buyer left in the same browser does not open the order.
        const colleagueWithProof = b2b.store(colleague.token);
        expect(
          (await get({ headers: { ...colleagueWithProof.headers, [ORDER_ACCESS_HEADER]: proof(order.id) } })).status
        ).toEqual(404);
        const buyerWithProof = b2b.store(buyer.token);
        expect(
          (await get({ headers: { ...buyerWithProof.headers, [ORDER_ACCESS_HEADER]: proof(order.id) } })).status
        ).toEqual(200);
      });
    });
  },
});
