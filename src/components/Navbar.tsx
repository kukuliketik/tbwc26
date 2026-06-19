'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthButtons from './AuthButtons'

const links = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/picks', label: 'Picks', icon: '⚽' },
  { href: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { href: '/matches', label: 'Schedule', icon: '📅' },
  { href: '/profile', label: 'Profile', icon: '👤' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-40 glass-fifa border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="https://digitalhub.fifa.com/transform/157d23bf-7e13-4d7b-949e-5d27d340987e/WC26_Logo?&io=transform:fill&quality=75"
              alt="TBWC26"
              className="h-8 sm:h-9 object-contain drop-shadow-lg"
            />
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {links.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-b from-wc-gold/30 to-wc-gold/10 text-wc-gold border border-wc-gold/40 shadow-fifa-gold scale-105'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm">{link.icon}</span>
                  {link.label}
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-wc-gold rounded-full shadow-fifa-gold" />
                  )}
                </Link>
              )
            })}
          </div>

          {/* Avatar only on mobile, full auth on desktop */}
          <div className="flex items-center gap-3">
            <AuthButtons />
          </div>
        </div>
      </div>
    </nav>
  )
}
