/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#0a0a0f',
          100: '#12121a',
          200: '#1a1a26',
          300: '#222233',
        },
        amber: {
          DEFAULT: '#f59e0b',
          400: '#f59e0b',
          500: '#d97706',
          600: '#b45309',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      lineHeight: {
        relaxed: '1.7',
      },
      letterSpacing: {
        'wide-custom': '0.02em',
      },
    },
  },
  plugins: [],
}