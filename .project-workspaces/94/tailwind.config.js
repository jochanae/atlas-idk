/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#060608',
          900: '#0a0a0f',
          800: '#0f0f17',
          700: '#16161f',
          600: '#1c1c28'
        },
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706'
        },
        gold: {
          400: '#d4a853',
          500: '#b8860b',
          muted: '#a07840'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif']
      },
      lineHeight: {
        relaxed: '1.7'
      },
      letterSpacing: {
        wide: '0.02em'
      },
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: []
}