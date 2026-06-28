/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#060608',
          900: '#0a0b0f',
          800: '#0f1018',
          700: '#141520',
          600: '#1a1b28'
        },
        gold: {
          300: '#f5d485',
          400: '#e8b84b',
          500: '#d4a017',
          600: '#b8860b'
        },
        glass: {
          white: 'rgba(255,255,255,0.04)',
          border: 'rgba(255,255,255,0.08)',
          gold: 'rgba(212,160,23,0.15)'
        }
      },
      fontFamily: {
        display: ['Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace']
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px'
      },
      boxShadow: {
        'gold-glow': '0 0 20px rgba(212,160,23,0.2), 0 0 60px rgba(212,160,23,0.05)',
        'glass-inset': 'inset 0 1px 0 rgba(255,255,255,0.06)',
        'deep': '0 25px 60px rgba(0,0,0,0.6), 0 8px 20px rgba(0,0,0,0.4)'
      },
      animation: {
        'pulse-gold': 'pulseGold 3s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite'
      },
      keyframes: {
        pulseGold: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' }
        }
      }
    }
  },
  plugins: []
}