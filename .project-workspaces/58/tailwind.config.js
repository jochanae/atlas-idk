/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        garden: {
          green: '#2d6a4f',
          light: '#52b788',
          pale: '#d8f3dc',
          soil: '#6b4226',
          sky: '#90e0ef'
        }
      }
    }
  },
  plugins: []
}