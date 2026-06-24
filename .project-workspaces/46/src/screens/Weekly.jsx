import React from 'react'
import { weeklyForecast } from '../data/mockWeather'

function RainBar({ percent }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-400"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-slate-400 text-xs w-8 text-right">{percent}%</span>
    </div>
  )
}

export default function Weekly() {
  return (
    <div className="px-4 pt-10 pb-4">
      <h1 className="text-white text-2xl font-semibold mb-1">7-Day Forecast</h1>
      <p className="text-slate-500 text-sm mb-6">New York, US</p>

      <div className="flex flex-col gap-3">
        {weeklyForecast.map((day) => (
          <div key={day.day} className="bg-slate-800/60 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{day.icon}</span>
                <div>
                  <p className="text-white font-medium text-sm">{day.day}</p>
                  <p className="text-slate-400 text-xs">{day.condition}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-white font-semibold">{day.high}°</span>
                <span className="text-slate-500 text-sm ml-2">{day.low}°</span>
              </div>
            </div>
            <RainBar percent={day.rain} />
            <p className="text-slate-500 text-xs mt-1.5">🌧️ {day.rain}% chance of rain</p>
          </div>
        ))}
      </div>
    </div>
  )
}