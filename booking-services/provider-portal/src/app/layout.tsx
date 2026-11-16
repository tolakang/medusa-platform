import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Provider portal",
  description: "Your calendar, bookings, hours and services.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
