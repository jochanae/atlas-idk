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

export default function Transactions() {
  const { transactions, deleteTransaction } = useExpenses()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const filtered = transactions.filter(tx => {
    const matchesType = filter === 'all' || tx.type === filter
    const matchesSearch = tx.title.toLowerCase().includes(search.toLowerCase()) ||
      tx.category.toLowerCase().includes(search.toLowerCase())
    return matchesType && matchesSearch
  })

  const handleDelete = (id) => {
    setDeletingId(id)
    setTimeout(() => {
      deleteTransaction(id)
      setDeletingId(null)
    }, 200)
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-800">Transactions</h1>
          <button
            onClick={() => setShowModal(true)}
            className="w-9 h-9 bg-green-600 rounded-full flex items-center justify-center text-white text-xl leading-none shadow-md active:scale-95"
          >
            +
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {['all', 'expense', 'income'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${
                filter === f
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-5 py-4 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">🔍</p>
            <p className="text-sm">No transactions found</p>
          </div>
        )}

        {filtered.map(tx => (
          <div
            key={tx.id}
            className={`bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm transition-all ${
              deletingId === tx.id ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-semibold flex-shrink-0 ${CATEGORY_COLORS[tx.category] || 'bg-gray-100 text-gray-600'}`}>
              {tx.category.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{tx.title}</p>
              <p className="text-xs text-gray-400">{tx.category} · {tx.date}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <p className={`text-sm font-semibold ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
              </p>
              <button
                onClick={() => handleDelete(tx.id)}
                className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-400 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && <AddTransactionModal onClose={() => setShowModal(false)} />}
    </div>
  )
}