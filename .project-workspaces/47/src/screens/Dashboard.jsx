import React, { useState } from 'react'
import { useExpenses } from '../context/ExpenseContext'
import AddTransactionModal from '../components/AddTransactionModal'

const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const CATEGORY_COLORS = {
  Food: 'bg-orange-100 text-orange-600',
  Transport: 'bg-blue-100 text-blue-600',
  Bills: 'bg-purple-100 text-purple-600',
  Entertainment: 'bg-pink-100 text-pink-600',
  Health: 'bg-red-100 text-red-600',
  Shopping: 'bg-yellow-100 text-yellow-600',
  Income: 'bg-green-100 text-green-600',
  Salary: 'bg-green-100 text-green-600',
  Freelance: 'bg-teal-100 text-teal-600',
  Other: 'bg-gray-100 text-gray-600',
}

export default function Dashboard() {
  const { transactions, totalIncome, totalExpenses, balance } = useExpenses()
  const [showModal, setShowModal] = useState(false)

  const recent = transactions.slice(0, 5)

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-green-600 pt-12 pb-16 px-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-green-200 text-sm">Total Balance</p>
            <h1 className={`text-3xl font-bold mt-0.5 ${balance >= 0 ? 'text-white' : 'text-red-200'}`}>
              {fmt(balance)}
            </h1>
          </div>
          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
            E
          </div>
        </div>

        {/* Income / Expense cards */}
        <div className="flex gap-3">
          <div className="flex-1 bg-green-500/40 rounded-2xl p-3">
            <p className="text-green-100 text-xs mb-1">Income</p>
            <p className="text-white font-bold text-base">{fmt(totalIncome)}</p>
          </div>
          <div className="flex-1 bg-green-500/40 rounded-2xl p-3">
            <p className="text-green-100 text-xs mb-1">Expenses</p>
            <p className="text-white font-bold text-base">{fmt(totalExpenses)}</p>
          </div>
        </div>
      </div>

      {/* Content pulled up over header */}
      <div className="-mt-6 rounded-t-3xl bg-gray-50 flex-1 px-5 pt-5">

        {/* Quick add */}
        <button
          onClick={() => setShowModal(true)}
          className="w-full bg-white border-2 border-dashed border-green-300 rounded-2xl py-3.5 text-green-600 font-medium text-sm flex items-center justify-center gap-2 mb-5 active:bg-green-50"
        >
          <span className="text-xl leading-none">+</span>
          Add Transaction
        </button>

        {/* Recent transactions */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Recent</h2>
          <span className="text-xs text-gray-400">{transactions.length} total</span>
        </div>

        <div className="space-y-2">
          {recent.map(tx => (
            <div key={tx.id} className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-semibold flex-shrink-0 ${CATEGORY_COLORS[tx.category] || 'bg-gray-100 text-gray-600'}`}>
                {tx.category.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{tx.title}</p>
                <p className="text-xs text-gray-400">{tx.category} · {tx.date}</p>
              </div>
              <p className={`text-sm font-semibold flex-shrink-0 ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
              </p>
            </div>
          ))}
        </div>

        {transactions.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">💸</p>
            <p className="text-sm">No transactions yet</p>
          </div>
        )}
      </div>

      {showModal && <AddTransactionModal onClose={() => setShowModal(false)} />}
    </div>
  )
}