import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import Navbar from '@/components/Navbar'
import BottomNav from '@/components/BottomNav'
import SessionProvider from '@/components/SessionProvider'

export const metadata: Metadata = {
  title: 'TBWC26 — Transaction Banking World Cup 2026 Predictions Challenge',
  description: 'Predict match results, earn points, and compete on the leaderboard for FIFA World Cup 2026',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-app">
        <SessionProvider>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
            {children}
          </main>
          <BottomNav />
        </SessionProvider>
        <Analytics />
      </body>
    </html>
  )
}
