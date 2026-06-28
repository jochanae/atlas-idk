import React, { useState } from 'react'
import { settings as initialSettings } from '../data/mockData'

function ToggleRow({ label, description, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {description && <div className="text-xs text-gray-400 mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          value ? 'bg-garden-green' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function InputRow({ label, value, onChange, type = 'text' }) {
  return (
    <div className="py-3">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-garden-light"
      />
    </div>
  )
}

function SelectRow({ label, value, onChange, options }) {
  return (
    <div className="py-3">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-garden-light"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState(initialSettings)
  const [saved, setSaved] = useState(false)

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-garden-green">Settings ⚙️</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your garden preferences</p>
      </header>

      {/* Garden Info */}
      <section className="bg-white rounded-xl shadow-sm px-4 mb-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-4 pb-1">Garden Info</h2>
        <div className="divide-y divide-gray-100">
          <InputRow
            label="Garden Name"
            value={settings.gardenName}
            onChange={v => update('gardenName', v)}
          />
          <InputRow
            label="Your Name"
            value={settings.ownerName}
            onChange={v => update('ownerName', v)}
          />
        </div>
      </section>

      {/* Watering Preferences */}
      <section className="bg-white rounded-xl shadow-sm px-4 mb-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-4 pb-1">Watering</h2>
        <div className="divide-y divide-gray-100">
          <InputRow
            label="Daily Reminder Time"
            value={settings.reminderTime}
            onChange={v => update('reminderTime', v)}
            type="time"
          />
          <SelectRow
            label="Water Amount Unit"
            value={settings.wateringUnit}
            onChange={v => update('wateringUnit', v)}
            options={[
              { value: 'ml', label: 'Milliliters (ml)' },
              { value: 'oz', label: 'Fluid Ounces (oz)' },
              { value: 'cups', label: 'Cups' }
            ]}
          />
          <ToggleRow
            label="Watering Reminders"
            description="Get notified when plants need water"
            value={settings.notificationsEnabled}
            onChange={v => update('notificationsEnabled', v)}
          />
        </div>
      </section>

      {/* Timezone */}
      <section className="bg-white rounded-xl shadow-sm px-4 mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-4 pb-1">Regional</h2>
        <div className="divide-y divide-gray-100">
          <SelectRow
            label="Timezone"
            value={settings.timezone}
            onChange={v => update('timezone', v)}
            options={[
              { value: 'America/New_York', label: 'Eastern Time (ET)' },
              { value: 'America/Chicago', label: 'Central Time (CT)' },
              { value: 'America/Denver', label: 'Mountain Time (MT)' },
              { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
              { value: 'Europe/London', label: 'London (GMT)' },
              { value: 'Europe/Paris', label: 'Central European (CET)' }
            ]}
          />
        </div>
      </section>

      {/* Save */}
      <button
        onClick={handleSave}
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
          saved
            ? 'bg-garden-light text-white'
            : 'bg-garden-green text-white hover:bg-garden-light'
        }`}
      >
        {saved ? '✓ Saved!' : 'Save Settings'}
      </button>

      <p className="text-center text-xs text-gray-400 mt-4 mb-2">SmartGarden v1.0</p>
    </div>
  )
}