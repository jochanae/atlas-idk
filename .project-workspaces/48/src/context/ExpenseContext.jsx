import React, { createContext, useContext, useState, useEffect } from 'react'

const ExpenseContext = createContext()

const STORAGE_KEY = 'expense_tracker_data'

const DEFAULT_CATEGORIES = [
  { id: 'food', label: 'Food & Drink', emoji: '🍔', color: '#f97316' },
  { id: 'transport', label: 'Transport', emoji: '🚗', color: '#3b82f6' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#ec4899' },
  { id: 'bills', label: 'Bills', emoji: '💡', color: '#eab308' },
  { id: 'health', label: 'Health', emoji: '💊', color: '#22c55e' },
  { id: 'entertainment', label: 'Entertainment', emoji: '🎬', color: '#a855f7' },
  { id: 'other', label: 'Other', emoji: '📦', color: '#6b7280' }
]

const SEED_TRANSACTIONS = [
  { id: '1', type: 'expense', amount: 12.50, category: 'food', note: 'Lunch at café', date: new Date(Date.now() - 86400000 * 0).toISOString() },
  { id: '2', type: 'expense', amount: 45.00, category: 'transport', note: 'Uber rides', date: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: '3', type: 'income', amount: 2500.00, category: 'other', note: 'Monthly salary', date: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: '4', type: 'expense', amount: 89.99, category: 'shopping', note: 'New shoes', date: new Date(Date.now() - 86400000 * 3).toISOString() },
  { id: '5', type: 'expense', amount: 120.00, category: 'bills', note: 'Electricity bill', date: new Date(Date.now() - 86400000 * 4).toISOString() },
  { id: '6', type: 'expense', amount: 18.00, category: 'entertainment', note: 'Netflix + Spotify', date: new Date(Date.now() - 86400000 * 5).toISOString() },
  { id: '7', type: 'expense', amount: 35.00, category: 'health', note: 'Pharmacy', date: new Date(Date.now() - 86400000 * 6).toISOString() },
]

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  return null
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {}
}

export function ExpenseProvider({ children }) {
  const [transactions, setTransactions] = useState(() => {
    const saved = loadFromStorage()
    return saved?.transactions ?? SEED_TRANSACTIONS
  })

  useEffect(() => {
    saveToStorage({ transactions })
  }, [transactions])

  function addTransaction(tx) {
    const newTx = {
      ...tx,
      id: Date.now().toString(),
      date: new Date().toISOString()
    }
    setTransactions(prev => [newTx, ...prev])
  }

  function deleteTransaction(id) {
    setTransactions(prev => prev.filter(tx => tx.id !== id))
  }

  const totalIncome = transactions
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const totalExpenses = transactions
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const balance = totalIncome - totalExpenses

  return (
    <ExpenseContext.Provider value={{
      transactions,
      addTransaction,
      deleteTransaction,
      totalIncome,
      totalExpenses,
      balance,
      categories: DEFAULT_CATEGORIES
    }}>
      {children}
    </ExpenseContext.Provider>
  )
}

export function useExpenses() {
  return useContext(ExpenseContext)
}