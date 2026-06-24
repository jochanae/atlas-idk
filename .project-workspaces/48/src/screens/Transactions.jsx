```jsx
import React, { useContext } from 'react';
import { ExpenseContext } from '../context/ExpenseContext';

const Transactions = () => {
  const { expenses } = useContext(ExpenseContext);

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Transactions</h2>
      <ul>
        {expenses.map((expense, index) => (
          <li key={index} className="border-b py-2">
            <span className="block">{expense.name}</span>
            <span className="text-sm text-gray-500">{expense.date}</span>
            <span className="block font-medium">${expense.amount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Transactions;
```