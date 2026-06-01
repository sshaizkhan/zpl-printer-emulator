/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF3ED',
          100: '#FFE4CC',
          200: '#FFC494',
          300: '#FFA05B',
          400: '#FF7826',
          500: '#FF6B35',
          600: '#E8520D',
          700: '#C23D08',
          800: '#9A2E06',
          900: '#7A2506',
          950: '#4A1503',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'slide-up': 'slideUp 0.25s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'led-pulse': 'ledPulse 2.5s ease-in-out infinite',
        'card-in': 'cardIn 0.3s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        ledPulse: {
          '0%, 100%': { boxShadow: '0 0 5px #10B981' },
          '50%': { boxShadow: '0 0 12px #10B981, 0 0 24px rgba(16,185,129,0.3)' },
        },
        cardIn: {
          '0%': { opacity: '0', transform: 'translateY(-6px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
