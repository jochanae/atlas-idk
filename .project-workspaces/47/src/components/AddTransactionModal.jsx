import React, { useState } from 'react'
import { useExpenses } from '../context/ExpenseContext'

const CATEGORIES = {
  expense: ['Food', 'Transport', 'Bills', 'Entertainment', 'Health', 'Shopping', 'Other'],
  income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'],
}

export default function AddTransactionModal({ onClose }) {
  const { addTransaction } = useExpenses()
  const [type, setType] = useState('expense')
  const [form, setForm] = useState({
    title: '',
    amount: '',
    category: CATEGORIES.expense[0],
    date: new Date().toISOString().split('T')[0],
  })

  const handleTypeChange = (newType) => {
    setType(newType)
    setForm(f => ({ ...f, category: CATEGORIES[newType][0] }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title || !form.amount) return
    addTransaction({
      ...form,
      amount: parseFloat(form.amount),
      type,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-t-2xl p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Add Transaction</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Type toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
          {['expense', 'income'].map(t => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                type === t
                  ? t === 'expense' ? 'bg-red-500 text-white shadow-sm' : 'bg-green-500 text-white shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Title</label>
            <input
              type="text"
              placeholder="e.g. Groceries"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full mt-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Amount ($)</label>
            <input
              type="number"
              placeholder="0.00"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full mt-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full mt-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            >
              {CATEGORIES[type].map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full mt-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          <button
            type="submit"
            className={`w-full py-3 rounded-xl text-white font-semibold text-sm mt-2 transition-opacity active:opacity-80 ${
              type === 'expense' ? 'bg-red-500' : 'bg-green-500'
            }`}
          >
            Add {type === 'expense' ? 'Expense' : 'Income'}
          </button>
        </form>
      </div>
    </div>
  )
}