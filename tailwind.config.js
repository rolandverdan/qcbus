/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./commuter/**/*.{html,js}",
    "./conductors/**/*.{html,js}",
    "./admin/**/*.{html,js}",
  ],
  theme: {
    extend: {
      colors: {
        'qc-blue': '#1e40af',
        'qc-yellow': '#fbbf24',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}