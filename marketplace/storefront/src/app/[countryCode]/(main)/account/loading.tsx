// A skeleton of the account page while it loads, so the page isn't blank
// for a second or more (role test 2026-11-25).
export default function Loading() {
  return (
    <div
      className="flex w-full flex-col gap-y-6 animate-pulse"
      aria-busy="true"
      aria-label="Loading your account"
      data-testid="account-loading"
    >
      <div className="h-8 w-48 rounded-md bg-ui-bg-subtle" />
      <div className="h-4 w-72 max-w-full rounded-md bg-ui-bg-subtle" />
      <div className="flex flex-col gap-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 w-full rounded-md bg-ui-bg-subtle" />
        ))}
      </div>
    </div>
  )
}
