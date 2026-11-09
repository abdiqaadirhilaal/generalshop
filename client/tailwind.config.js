/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#101C2C',
          50: '#F3F5F8',
          100: '#E4E8EE',
          200: '#C5CDD9',
          300: '#9DAABD',
          400: '#6E8099',
          500: '#4C5F79',
          600: '#364A62',
          700: '#24374C',
          800: '#182838',
          900: '#101C2C',
          950: '#0A131F',
        },
        canvas: '#F5F5F2',
        gold: {
          DEFAULT: '#C69B4D',
          50: '#FBF6EC',
          100: '#F4E9D2',
          200: '#E9D3A5',
          300: '#DCB96F',
          400: '#D0A85C',
          500: '#C69B4D',
          600: '#A87E37',
          700: '#85612C',
          800: '#5E451F',
          900: '#3E2E15',
        },
        line: '#E9EDF2',
        body: '#202938',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,28,44,0.04), 0 8px 24px -12px rgba(16,28,44,0.12)',
        lift: '0 2px 4px rgba(16,28,44,0.04), 0 18px 40px -20px rgba(16,28,44,0.22)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
