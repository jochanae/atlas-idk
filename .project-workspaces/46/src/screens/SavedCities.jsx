import React, { useState } from 'react'
import { savedCities as initialCities } from '../data/mockWeather'

export default function SavedCities() {
  const [cities, setCities] = useState(initialCities)
  const [removing, setRemoving] = useState(null)

  function removeCity(id) {
    setRemoving(id)
    setTimeout(() => {
      setCities((prev) => prev.filter((c) => c.id !== id))
      setRemoving(null)
    }, 300)
  }

  return (
    <div className="px-4 pt-10 pb-4">
      <h1 className="text-white text-2xl font-semibold mb-1">Saved Cities</h1>
      <p className="text-slate-500 text-sm mb-6">{cities.length} location{cities.length !== 1 ? 's' : ''} saved</p>

      <div className="flex flex-col gap-3">
        {cities.map((c) => (
          <div
            key={c.id}
            className={`bg-slate-800/60 rounded-2xl px-5 py-4 flex items-center justify-between transition-opacity duration-300 ${removing === c.id ? 'opacity-0' : 'opacity-100'}`}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">{c.icon}</span>
              <div>
                <p className="text-white font-semibold">{c.city}</p>
                <p className="text-slate-400 text-xs">{c.country} · H:{c.high}° L:{c.low}°</p>
                <p className="text-slate-500 text-xs mt-0.5">{c.condition}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-white text-2xl font-light">{c.temp}°</span>
              <button
                onClick={() => removeCity(c.id)}
                className="text-slate-600 hover:text-red-400 transition-colors text-xs"
                aria-label={`Remove ${c.city}`}
              >
                ✕ remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {cities.length === 0 && (
        <div className="text-center mt-20">
          <p className="text-4xl mb-3">📍</p>
          <p className="text-slate-400">No saved cities</p>
          <p className="text-slate-600 text-sm mt-1">Add cities to track weather across locations</p>
        </div>
      )}
    </div>
  )
}