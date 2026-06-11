'use client'

import { useState } from 'react'

interface Props {
  name: string
  image?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = {
  sm: { outer: 'w-7 h-7', inner: 'text-[10px]' },
  md: { outer: 'w-8 h-8', inner: 'text-xs' },
  lg: { outer: 'w-14 h-14', inner: 'text-xl' },
  xl: { outer: 'w-20 h-20', inner: 'text-2xl' },
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function getColorFromName(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-red-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-teal-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-wc-gold',
    'bg-wc-navy',
  ]
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  return colors[index]
}

export default function Avatar({ name, image, size = 'md', className = '' }: Props) {
  const [imgError, setImgError] = useState(false)
  const sz = SIZES[size]

  if (image && !imgError) {
    return (
      <img
        src={image}
        alt={name}
        onError={() => setImgError(true)}
        className={`${sz.outer} rounded-full object-cover ring-2 ring-white/50 dark:ring-gray-800 ${className}`}
      />
    )
  }

  const initials = getInitials(name)
  const bgColor = getColorFromName(name)

  return (
    <div
      className={`${sz.outer} ${bgColor} rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
    >
      <span className={`${sz.inner} font-bold text-white`}>{initials}</span>
    </div>
  )
}
