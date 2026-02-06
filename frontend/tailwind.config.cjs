/** @type {import('tailwindcss').Config} */
module.exports = {
  // В Tailwind v4 при использовании `@config` важно, чтобы CSS-файлы, где есть `@apply`,
  // тоже попадали в источники сканирования.
  content: ['./index.html', './src/**/*.{ts,tsx,css}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
}
