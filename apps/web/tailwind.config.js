import plugin from 'tailwindcss/plugin';
import temas from './themes.cjs';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Escalas (slate, blue, red, ...) vêm de variáveis CSS: cada tema em
      // themes.cjs redefine as variáveis, sem tocar nas classes das páginas.
      colors: {
        ...temas.coresTailwind(),
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        rigabras: {
          950: '#0f172a',
          900: '#111c34',
          700: '#1e3a5f',
          500: 'rgb(var(--c-blue-600) / <alpha-value>)',
          100: 'rgb(var(--c-blue-100) / <alpha-value>)',
        },
        tms: {
          cyan: '#00f2fe',
          amber: '#ff9f43',
          bg: '#090d16',
          surface: '#0e1726',
        },
        brand: {
          green: '#22c55e',
          greendark: '#15803d',
          yellow: '#facc15',
          yellowdark: '#eab308',
        },
      },
      // `white` como fundo/borda/anel é a superfície dos cards (muda com o
      // tema); `text-white` continua branco de verdade (texto sobre botões).
      backgroundColor: { white: 'rgb(var(--surface) / <alpha-value>)' },
      borderColor: { white: 'rgb(var(--surface) / <alpha-value>)' },
      ringColor: { white: 'rgb(var(--surface) / <alpha-value>)' },
      divideColor: { white: 'rgb(var(--surface) / <alpha-value>)' },
      boxShadow: {
        'glow-green': '0 0 20px rgba(34, 197, 94, 0.35), 0 0 60px rgba(34, 197, 94, 0.15)',
        'glow-yellow': '0 0 20px rgba(250, 204, 21, 0.35), 0 0 60px rgba(250, 204, 21, 0.15)',
        'glow-blue': '0 0 20px rgba(37, 99, 235, 0.35), 0 0 60px rgba(37, 99, 235, 0.15)',
        depth: '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 30px rgba(0,0,0,0.55)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(160deg, #15803d 0%, #22c55e 45%, #facc15 100%)',
        'brand-radial': 'radial-gradient(circle at 50% 0%, rgba(34,197,94,0.18), transparent 60%)',
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out both',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase(temas.cssDosTemas());
    }),
  ],
};
