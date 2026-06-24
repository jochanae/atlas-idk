import React, { createContext, useContext, useState, useEffect } from 'react'

const ExpenseContext = createContext()

const STORAGE_KEY = 'expense_tracker_data'

const SAMPLE_DATA = [
  { id: '1', title: 'Groceries', amount: 84.50, category: 'Food', date: '2025-01-20', type: 'expense' },
  { id: '2', title: 'Salary', amount: 3200.00, category: 'Income', date: '2025-01-15', type: 'income' },
  { id: '3', title: 'Netflix', amount: 15.99, category: 'Entertainment', date: '2025-01-18', type: 'expense' },
  { id: '4', title: 'Gas', amount: 52.00, category: 'Transport', date: '2025-01-19', type: 'expense' },
  { id: '5', title: 'Gym', amount: 45.00, category: 'Health', date: '2025-01-10', type: 'expense' },
  { id: '6', title: 'Freelance', amount: 600.00, category: 'Income', date: '2025-01-12', type: 'income' },
  { id: '7', title: 'Electricity', amount: 110.00, category: 'Bills', date: '2025-01-08', type: 'expense' },
  { id: '8', title: 'Coffee', amount: 22.50, category: 'Food', date: '2025-01-21', type: 'expense' },
]

export function ExpenseProvider({ children }) {
  const [transactions, setTransactions] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : SAMPLE_DATA
    } catch {
      return SAMPLE_DATA
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
  }, [transactions])

  const addTransaction = (tx) => {
    const newTx = { ...tx, id: Date.now().toString() }
    setTransactions(prev => [newTx, ...prev])
  }

  const deleteTransaction = (id) => {
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
    }}>
      {children}
    </ExpenseContext.Provider>
  )
}

export function useExpenses() {
  return useContext(ExpenseContext)
}