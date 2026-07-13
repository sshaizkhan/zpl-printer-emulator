/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Mujin orange — primary accent
        brand: {
          50: '#fdf1ea',
          100: '#fbe0cf',
          200: '#f6bd9c',
          300: '#f19a68',
          400: '#ec7d42',
          500: '#e76125',
          600: '#c94e1a',
          700: '#a13d14',
          800: '#7a2f10',
          900: '#54200b',
          950: '#331306',
        },
        // Mujin red — danger/error accent
        signal: {
          500: '#d21419',
          600: '#b01115',
        },
        // warm near-black surfaces, replaces default cool gray
        gray: {
          50: '#f7f6f5',
          100: '#ececec',
          200: '#d9d8d6',
          300: '#b8b6b3',
          400: '#8f8d8a',
          500: '#646d72',
          600: '#4d5155',
          700: '#33363a',
          800: '#1f2226',
          900: '#14161a',
          950: '#0b0c0e',
        },
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'pulse-glow-green': 'pulseGlowGreen 2s ease-in-out infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(231, 97, 37, 0.55)' },
          '50%': { boxShadow: '0 0 0 4px rgba(231, 97, 37, 0)' },
        },
        pulseGlowGreen: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.55)' },
          '50%': { boxShadow: '0 0 0 4px rgba(16, 185, 129, 0)' },
        },
      },
    },
  },
  plugins: [],
};
