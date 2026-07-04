/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          900: '#0a0a0f',
          800: '#0f0f18',
          700: '#141420',
          600: '#1a1a2a',
          500: '#21213a',
        },
        amber: {
          gold: '#c49748',
          light: '#d4aa5c',
          muted: '#8a6a30',
          glow: 'rgba(196,151,72,0.15)',
        },
        glass: {
          border: 'rgba(255,255,255,0.08)',
          surface: 'rgba(255,255,255,0.04)',
          hover: 'rgba(255,255,255,0.07)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        xs: '4px',
        glass: '16px',
      },
      boxShadow: {
        glass: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        amber: '0 0 20px rgba(196,151,72,0.2)',
        'amber-sm': '0 0 8px rgba(196,151,72,0.15)',
      },
      animation: {
        'fade-up': 'fadeUp 0.3s ease-out',
        'pulse-amber': 'pulseAmber 2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseAmber: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(196,151,72,0.15)' },
          '50%': { boxShadow: '0 0 20px rgba(196,151,72,0.35)' },
        },
      },
    },
  },
  plugins: [],
}