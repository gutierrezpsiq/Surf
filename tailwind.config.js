/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface-1)',
        plane: 'var(--plane)',
        ink: 'var(--text-primary)',
        ink2: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        hair: 'var(--hair)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
