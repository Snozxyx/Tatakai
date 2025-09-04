import './globals.css'
import { Inter } from 'next/font/google'
import { Providers } from './providers'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
})

export const metadata = {
  title: 'Tatakai - Anime Streaming for TV',
  description: 'Netflix-style anime streaming optimized for LG webOS TV',
  keywords: ['anime', 'streaming', 'tv', 'webos', 'lg'],
  authors: [{ name: 'Tatakai Team' }],
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  robots: 'noindex, nofollow', // Prevent indexing for TV app
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        {/* webOS TV optimizations */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#000000" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="bg-background text-foreground min-h-screen">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}