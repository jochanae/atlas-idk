import React, { useState } from 'react'
import { plants as initialPlants } from '../data/mockData'

function PlantDetail({ plant, onClose }) {
  const completed = plant.wateringSchedules.filter(s => s.completed)
  const pending = plant.wateringSchedules.filter(s => !s.completed)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{plant.name}</h2>
            <p className="text-xs text-gray-400 italic">{plant.species}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-garden-pale rounded-xl p-3">
              <div className="text-xs text-gray-500">Location</div>
              <div className="text-sm font-medium text-gray-800 mt-1">📍 {plant.location}</div>
            </div>
            <div className="bg-garden-pale rounded-xl p-3">
              <div className="text-xs text-gray-500">Watering Frequency</div>
              <div className="text-sm font-medium text-gray-800 mt-1">Every {plant.wateringFrequencyDays} days</div>
            </div>
            <div className="bg-garden-pale rounded-xl p-3">
              <div className="text-xs text-gray-500">Last Watered</div>
              <div className="text-sm font-medium text-gray-800 mt-1">{plant.lastWatered}</div>
            </div>
            <div className="bg-garden-pale rounded-xl p-3">
              <div className="text-xs text-gray-500">Completed Waterings</div>
              <div className="text-sm font-medium text-gray-800 mt-1">{completed.length} sessions</div>
            </div>
          </div>

          {plant.notes && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">Notes</div>
              <p className="text-sm text-gray-700">{plant.notes}</p>
            </div>
          )}

          {pending.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Upcoming Waterings</h3>
              <div className="space-y-2">
                {pending.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3">
                    <div className="text-sm text-gray-700">{s.scheduledDate}</div>
                    <div className="text-xs text-garden-green font-medium">{s.amountMl}ml</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Watering History</h3>
              <div className="space-y-2">
                {completed
                  .sort((a, b) => new Date(b.scheduledDate) - new Date(a.scheduledDate))
                  .map(s => (
                    <div key={s.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3">
                      <div className="text-sm text-gray-700">{s.scheduledDate}</div>
                      <span className="text-xs text-garden-light font-medium">✓ {s.amountMl}ml</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlantCard({ plant, onSelect }) {
  const nextSchedule = plant.wateringSchedules.find(s => !s.completed)
  return (
    <button
      onClick={() => onSelect(plant)}
      className="w-full text-left bg-white rounded-xl shadow-sm px-4 py-4 hover:bg-garden-pale transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">{plant.name}</h3>
          <p className="text-xs text-gray-400 italic">{plant.species}</p>
          <p className="text-xs text-gray-500 mt-1">📍 {plant.location}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Every {plant.wateringFrequencyDays}d</div>
          {nextSchedule && (
            <div className="text-xs text-garden-green mt-1">
              Next: {nextSchedule.scheduledDate}
            </div>
          )}
        </div>
      </div>
      {plant.notes && (
        <p className="text-xs text-gray-500 mt-2 border-t border-gray-100 pt-2 line-clamp-1">
          {plant.notes}
        </p>
      )}
    </button>
  )
}

export default function Plants() {
  const [plants] = useState(initialPlants)
  const [selected, setSelected] = useState(null)

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-garden-green">My Plants 🪴</h1>
        <p className="text-gray-500 text-sm mt-1">{plants.length} plants in your garden</p>
      </header>

      <div className="space-y-3">
        {plants.map(plant => (
          <PlantCard key={plant.id} plant={plant} onSelect={setSelected} />
        ))}
      </div>

      {selected && (
        <PlantDetail plant={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}