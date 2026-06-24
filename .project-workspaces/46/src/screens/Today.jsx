import React from 'react'
import { currentWeather, hourlyForecast } from '../data/mockWeather'

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-slate-800/60 rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-slate-400 text-xs">{icon} {label}</span>
      <span className="text-white font-semibold text-lg">{value}</span>
    </div>
  )
}

export default function Today() {
  const w = currentWeather

  return (
    <div className="px-4 pt-10 pb-4">
      {/* Location */}
      <div className="text-center mb-6">
        <p className="text-slate-400 text-sm">📍 {w.city}, {w.country}</p>
        <div className="text-8xl my-3">{w.icon}</div>
        <h1 className="text-7xl font-thin text-white">{w.temp}°</h1>
        <p className="text-slate-300 text-lg mt-1">{w.condition}</p>
        <p className="text-slate-500 text-sm mt-1">H:{w.high}° · L:{w.low}°</p>
      </div>

      {/* Feels like banner */}
      <div className="bg-sky-900/40 border border-sky-800/50 rounded-2xl px-5 py-3 mb-4 text-center">
        <p className="text-sky-300 text-sm">Feels like <span className="font-semibold text-white">{w.feelsLike}°F</span></p>
      </div>

      {/* Hourly scroll */}
      <div className="mb-6">
        <h2 className="text-slate-400 text-xs uppercase tracking-widest mb-3 px-1">Hourly</h2>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {hourlyForecast.map((h) => (
            <div key={h.time} className="flex flex-col items-center gap-1.5 bg-slate-800/60 rounded-2xl px-4 py-3 min-w-[64px]">
              <span className="text-slate-400 text-xs">{h.time}</span>
              <span className="text-2xl">{h.icon}</span>
              <span className="text-white font-medium text-sm">{h.temp}°</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stat grid */}
      <h2 className="text-slate-400 text-xs uppercase tracking-widest mb-3 px-1">Details</h2>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Humidity"   value={`${w.humidity}%`}    icon="💧" />
        <StatCard label="Wind"       value={`${w.wind} mph`}     icon="💨" />
        <StatCard label="Visibility" value={`${w.visibility} mi`} icon="👁️" />
        <StatCard label="UV Index"   value={w.uvIndex}            icon="☀️" />
        <StatCard label="Sunrise"    value={w.sunrise}            icon="🌅" />
        <StatCard label="Sunset"     value={w.sunset}             icon="🌇" />
      </div>
    </div>
  )
}