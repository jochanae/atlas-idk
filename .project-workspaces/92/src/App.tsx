import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0f172a',
      fontFamily: 'sans-serif',
      gap: '2rem'
    }}>
      <h1 style={{
        fontSize: '5rem',
        fontWeight: '700',
        color: '#f8fafc',
        margin: 0
      }}>
        {count}
      </h1>
      <button
        onClick={() => setCount(count + 1)}
        style={{
          padding: '0.875rem 2.5rem',
          fontSize: '1.125rem',
          fontWeight: '600',
          color: '#0f172a',
          backgroundColor: '#f59e0b',
          border: 'none',
          borderRadius: '0.75rem',
          cursor: 'pointer',
          transition: 'background-color 0.15s ease'
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d97706')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
      >
        Click me
      </button>
    </div>
  )
}