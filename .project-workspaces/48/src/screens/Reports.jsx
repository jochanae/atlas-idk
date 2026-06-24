```jsx
import React, { useContext } from 'react';
import { ExpenseContext } from '../context/ExpenseContext';

const Reports = () => {
  const { expenses } = useContext(ExpenseContext);

  const totalSpent = expenses.reduce((total, exp) => total + exp.amount, 0);

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Reports</h2>
      <div className="p-4 bg-white rounded shadow">
        <p>Total Spent: ${totalSpent.toFixed(2)}</p>
      </div>
    </div>
  );
};

export default Reports;
```