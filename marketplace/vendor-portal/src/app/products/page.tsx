import { Shell } from "@/components/shell";
import { day, money } from "@/lib/format";
import { requireVendor, vendorGet } from "@/lib/server/vendor";
import { ProductForm } from "./product-form";
import { StockForm } from "./stock-form";

type Product = {
  id: string;
  title: string;
  status: "draft" | "proposed" | "published" | "rejected";
  created_at: string;
  variants: {
    sku: string | null;
    prices: { amount: number; currency_code: string }[];
  }[];
  stock: {
    tracked: boolean;
    quantity: number | null;
    available: number | null;
  };
};

const STATUS_TEXT: Record<Product["status"], string> = {
  draft: "Draft",
  proposed: "Waiting for review",
  published: "Published",
  rejected: "Rejected",
};

// TASKS P6-09: the vendor's products (GET /vendors/products) and a form to add
// one (P6-04).
export default async function ProductsPage() {
  const { token, vendor } = await requireVendor();
  if (vendor.status !== "active") {
    // Shell shows the review / paused screen (no data to load).
    return (
      <Shell vendor={vendor} active="/products">
        {null}
      </Shell>
    );
  }
  const { products } = await vendorGet<{ products: Product[] }>(
    token,
    "/vendors/products",
  );
  return (
    <Shell vendor={vendor} active="/products">
      <ProductForm />
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Your products</h2>
        {products.length ? (
          <>
            <ul className="flex flex-col divide-y divide-ui-border-base text-sm sm:hidden">
              {products.map((p) => {
                const price = p.variants[0]?.prices[0];
                return (
                  <li key={p.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{p.title}</span>
                      <span>
                        {price ? money(price.amount, price.currency_code) : "—"}
                      </span>
                    </div>
                    <span className="text-ui-fg-subtle">
                      {STATUS_TEXT[p.status] ?? p.status} · added{" "}
                      {day(p.created_at)}
                    </span>
                    {p.stock.tracked ? (
                      <StockForm
                        productId={p.id}
                        quantity={p.stock.quantity ?? 0}
                      />
                    ) : (
                      <span className="text-ui-fg-subtle">Made to order</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <table className="hidden w-full text-sm sm:table">
              <thead className="text-left text-ui-fg-subtle">
                <tr>
                  <th className="py-1">Name</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>In stock</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const price = p.variants[0]?.prices[0];
                  return (
                    <tr key={p.id} className="border-t border-ui-border-base">
                      <td className="py-1">{p.title}</td>
                      <td>
                        {price ? money(price.amount, price.currency_code) : "—"}
                      </td>
                      <td>{STATUS_TEXT[p.status] ?? p.status}</td>
                      <td>
                        {p.stock.tracked ? (
                          <StockForm
                            productId={p.id}
                            quantity={p.stock.quantity ?? 0}
                          />
                        ) : (
                          <span className="text-ui-fg-subtle">
                            Made to order
                          </span>
                        )}
                      </td>
                      <td>{day(p.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-sm text-ui-fg-subtle">
            No products yet. Add your first one above; the marketplace reviews
            it before it goes on sale.
          </p>
        )}
      </section>
    </Shell>
  );
}
