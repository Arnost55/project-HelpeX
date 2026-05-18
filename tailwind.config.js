/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      fontSize: {
        'micro': ['11px', { lineHeight: '16px' }],
        'xs': ['13px', { lineHeight: '20px' }],
        'sm': ['15px', { lineHeight: '22px' }],
        'base': ['18px', { lineHeight: '26px' }],
      },
      fontWeight: {
        'normal': 400,
        'medium': 500,
        'semibold': 600,
        'bold': 700,
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
      transitionTimingFunction: {
        'ease-out': 'ease-out',
        'crisp': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        'focus': '0 0 0 1px var(--border-focus)',
      },
    },
  },
  plugins: [],
};
