import { Suspense } from 'react'
import HomeContent from './home-content'

export default function Page() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-500">Loading...</div>}>
      <HomeContent />
    </Suspense>
  )
}
