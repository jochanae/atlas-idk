import React, { useState } from 'react'
import { useExpenses } from '../context/ExpenseContext'
import AddExpenseModal from '../components/AddExpenseModal'

function fmt(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function relativeDate(iso) {
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now - date) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const { transactions, balance, totalIncome, totalExpenses, categories, deleteTransaction } = useExpenses()
  const [showModal, setShowModal] = useState(false)

  const recent = transactions.slice(0, 5)

  function getCat(id) {
    return categories.find(c => c.id === id) || categories[categories.length - 1]
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-primary px-5 pt-12 pb-8">
        <p className="text-indigo-200 text-sm font-medium mb-1">Total Balance</p>
        <h1 className="text-white text-4xl font-bold tracking-tight">{fmt(balance)}</h1>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <div className="bg-white/15 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-full bg-green-400/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-300" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </span>
              <span className="text-indigo-200 text-xs font-medium">Income</span>
            </div>
            <p className="text-white font-bold text-lg">{fmt(totalIncome)}</p>
          </div>
          <div className="bg-white/15 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-full bg-red-400/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-300" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
              </span>
              <span className="text-indigo-200 text-xs font-medium">Expenses</span>
            </div>
            <p className="text-white font-bold text-lg">{fmt(totalExpenses)}</p>
          </div>
        </div>
      </div>

      {/* Add button */}
      <div className="px-5 -mt-5">
        <button
          onClick={() => setShowModal(true)}
          className="w-full bg-white shadow-lg shadow-indigo-100 border border-gray-100 rounded-2xl py-4 flex items-center justify-center gap-2 font-semibold text-primary active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Transaction
        </button>
      </div>

      {/* Recent transactions */}
      <div className="px-5 mt-6">
        <h2 className="text-base font-bold text-gray-900 mb-3">Recent Transactions</h2>

        {recent.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">💸</p>
            <p className="text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map(tx => {
              const cat = getCat(tx.category)
              return (
                <div
                  key={tx.id}
                  className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ backgroundColor: cat.color + '20' }}>
                    {cat.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{tx.note || cat.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{relativeDate(tx.date)}</p>
                  </div>
                  <p className={`font-bold text-sm ${tx.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && <AddExpenseModal onClose={() => setShowModal(false)} />}
    </div>
  )
}