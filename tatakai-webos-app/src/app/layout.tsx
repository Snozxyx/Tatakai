import type { Metadata } from 'next'
import './globals.css'
import { SpatialNavigationProvider } from '@/components/providers/spatial-navigation-provider'

export const metadata: Metadata = {
  title: 'Tatakai - Anime Streaming',
  description: 'Premium anime streaming experience for LG webOS TV',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/icon.png" />
      </head>
      <body>
        <SpatialNavigationProvider>
          {children}
        </SpatialNavigationProvider>
      </body>
    </html>
  )
}