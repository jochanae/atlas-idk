import React from 'react'
import { plants } from '../data/mockData'
import { Link } from 'react-router-dom'

function getDaysUntilWatering(plant) {
  const last = new Date(plant.lastWatered)
  const next = new Date(last)
  next.setDate(next.getDate() + plant.wateringFrequencyDays)
  const today = new Date('2024-06-12')
  const diff = Math.ceil((next - today) / (1000 * 60 * 60 * 24))
  return diff
}

function WaterStatus({ days }) {
  if (days <= 0) return <span className="text-red-500 font-semibold text-sm">Needs water now</span>
  if (days === 1) return <span className="text-orange-400 font-semibold text-sm">Water tomorrow</span>
  return <span className="text-garden-green font-semibold text-sm">In {days} days</span>
}

export default function Dashboard() {
  const dueToday = plants.filter(p => getDaysUntilWatering(p) <= 0)
  const upcoming = plants.filter(p => getDaysUntilWatering(p) > 0)
  const totalScheduled = plants.reduce((sum, p) => sum + p.wateringSchedules.filter(s => !s.completed).length, 0)

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-garden-green">SmartGarden 🌱</h1>
        <p className="text-gray-500 text-sm mt-1">Wednesday, June 12</p>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-2xl font-bold text-garden-green">{plants.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total Plants</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-2xl font-bold text-red-500">{dueToday.length}</div>
          <div className="text-xs text-gray-500 mt-1">Need Water</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-2xl font-bold text-orange-400">{totalScheduled}</div>
          <div className="text-xs text-gray-500 mt-1">Scheduled</div>
        </div>
      </div>

      {/* Due today */}
      {dueToday.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Needs Water Today
          </h2>
          <div className="space-y-2">
            {dueToday.map(plant => (
              <Link
                key={plant.id}
                to="/plants"
                className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-4 py-3 hover:bg-red-100 transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-800">{plant.name}</div>
                  <div className="text-xs text-gray-500">{plant.location}</div>
                </div>
                <WaterStatus days={getDaysUntilWatering(plant)} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Upcoming Waterings
        </h2>
        <div className="space-y-2">
          {upcoming
            .sort((a, b) => getDaysUntilWatering(a) - getDaysUntilWatering(b))
            .map(plant => (
              <Link
                key={plant.id}
                to="/plants"
                className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm hover:bg-garden-pale transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-800">{plant.name}</div>
                  <div className="text-xs text-gray-500">{plant.location}</div>
                </div>
                <WaterStatus days={getDaysUntilWatering(plant)} />
              </Link>
            ))}
        </div>
      </section>

      {/* Recent watering activity */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Recent Activity
        </h2>
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {plants
            .flatMap(p =>
              p.wateringSchedules
                .filter(s => s.completed)
                .map(s => ({ ...s, plantName: p.name }))
            )
            .sort((a, b) => new Date(b.scheduledDate) - new Date(a.scheduledDate))
            .slice(0, 5)
            .map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-800">{s.plantName}</div>
                  <div className="text-xs text-gray-400">{s.scheduledDate}</div>
                </div>
                <span className="text-xs text-garden-light font-medium">✓ {s.amountMl}ml</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  )
}