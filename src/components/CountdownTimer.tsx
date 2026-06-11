'use client'

import { useState, useEffect } from 'react'

interface CountdownTimerProps {
  targetDate: Date
  onComplete?: () => void
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calculateTimeLeft(target: Date): TimeLeft {
  const difference = target.getTime() - Date.now()

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  }
}

export default function CountdownTimer({ targetDate, onComplete }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(targetDate))
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(targetDate)
      setTimeLeft(newTimeLeft)

      if (newTimeLeft.days === 0 && newTimeLeft.hours === 0 && newTimeLeft.minutes === 0 && newTimeLeft.seconds === 0) {
        clearInterval(timer)
        onComplete?.()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [targetDate, onComplete])

  if (!mounted) return null

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 6

  if (timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0) {
    return (
      <div className="flex items-center gap-1 text-[10px] font-bold text-wc-gold">
        <span className="w-1.5 h-1.5 bg-wc-gold rounded-full live-pulse" />
        KICK OFF
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 ${isUrgent ? 'text-red-500' : 'text-wc-gold'}`}>
      {timeLeft.days > 0 && (
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] font-bold">{timeLeft.days}</span>
          <span className="text-[8px] opacity-70">d</span>
        </div>
      )}
      <div className="flex items-center gap-0.5">
        <span className="text-[10px] font-bold">{String(timeLeft.hours).padStart(2, '0')}</span>
        <span className="text-[8px] opacity-70">h</span>
      </div>
      <span className={`text-[10px] font-bold ${isUrgent ? 'animate-pulse' : ''}`}>:</span>
      <div className="flex items-center gap-0.5">
        <span className="text-[10px] font-bold">{String(timeLeft.minutes).padStart(2, '0')}</span>
        <span className="text-[8px] opacity-70">m</span>
      </div>
      <span className={`text-[10px] font-bold ${isUrgent ? 'animate-pulse' : ''}`}>:</span>
      <div className="flex items-center gap-0.5">
        <span className="text-[10px] font-bold">{String(timeLeft.seconds).padStart(2, '0')}</span>
        <span className="text-[8px] opacity-70">s</span>
      </div>
    </div>
  )
}
