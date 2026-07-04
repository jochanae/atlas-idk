import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6">
      <p className="text-7xl font-bold text-white tabular-nums">{count}</p>
      <button
        onClick={() => setCount(count + 1)}
        className="px-8 py-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-gray-950 font-semibold text-lg rounded-2xl transition-all duration-150"
      >
        Click me
      </button>
    </div>
  )
}