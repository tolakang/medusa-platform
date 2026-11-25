import { useEffect } from "react"

// Custom admin pages leave the tab title empty: set it, as the dashboard's
// own pages do (a11y review: an empty <title>).
export function usePageTitle(title: string) {
  useEffect(() => {
    const before = document.title
    document.title = `${title} | Medusa`
    return () => {
      document.title = before
    }
  }, [title])
}
