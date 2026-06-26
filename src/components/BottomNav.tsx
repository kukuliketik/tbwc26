'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/picks', label: 'Picks', icon: '⚽' },
  { href: '/golden-boot', label: 'Boot', icon: '🥇' },
  { href: '/leaderboard', label: 'Board', icon: '🏆' },
  { href: '/matches', label: 'Schedule', icon: '📅' },
  { href: '/profile', label: 'Profile', icon: '👤' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden glass-fifa border-t border-wc-gold/20 safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {links.map((link) => {
          const isActive = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all ${
                isActive
                  ? 'text-wc-gold scale-105'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              <span className={`text-xl ${isActive ? 'drop-shadow-lg' : ''} transition-transform`}>
                {link.icon}
              </span>
              <span className={`text-[10px] font-bold ${isActive ? 'text-wc-gold' : ''}`}>
                {link.label}
              </span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-wc-gold rounded-full shadow-fifa-gold" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
