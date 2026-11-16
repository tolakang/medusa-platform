// Result of a form's server action (TASKS P3-32).
export function Notice({ state }: { state: { error?: string; info?: string } }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
        {state.error}
      </p>
    )
  }
  return state.info ? (
    <p className="rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">{state.info}</p>
  ) : null
}
