'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useState } from 'react'
import Link from 'next/link'
import Avatar from './Avatar'

export default function AuthButtons() {
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)

  if (session?.user) {
    return (
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Avatar
            name={session.user.name ?? 'User'}
            image={session.user.image}
            size="md"
            className="ring-2 ring-wc-gold/50 shadow-fifa-gold"
          />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 mt-2 w-64 bg-[#0A1F3D] rounded-2xl shadow-2xl border border-wc-gold/30 py-1 z-20">
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-sm font-bold text-white">{session.user.name}</p>
                <p className="text-xs text-white/60 mt-0.5">{session.user.email}</p>
              </div>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-2 text-white/80 hover:text-white hover:bg-white/10 px-4 py-2.5 text-sm transition-colors"
              >
                <span>👤</span>
                Profile
              </Link>
              <div className="p-3">
                <button
                  onClick={() => { setMenuOpen(false); signOut() }}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => signIn('google')}
      className="btn-fifa-gold flex items-center gap-2 text-white rounded-xl px-4 py-2 text-sm font-semibold"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24">
        <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
        <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity="0.7"/>
        <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity="0.5"/>
        <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity="0.3"/>
      </svg>
      Sign in
    </button>
  )
}
