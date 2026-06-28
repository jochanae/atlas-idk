/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Georgia', 'Times New Roman', 'serif']
      },
      colors: {
        obsidian: {
          950: '#050508',
          900: '#0a0a12',
          800: '#0f0f1a',
          700: '#141422',
          600: '#1a1a2e'
        },
        gold: {
          300: '#f5d98b',
          400: '#e8bc5a',
          500: '#d4a017',
          600: '#b8860b'
        }
      },
      animation: {
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s ease-in-out infinite'
      },
      keyframes: {
        pulseGold: {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' }
        }
      }
    }
  },
  plugins: []
}