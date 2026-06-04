/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        'black': '#0a0a0a',
        'dark': '#1a1a1a',
        'orange': '#ff6b35',
        'orange-dark': '#e85a2c',
        'orange-light': '#ff8c52',
        'gray-dark': '#2a2a2a',
        'gray-light': '#4a4a4a',
      },
      fontFamily: {
        'sans': ['Inter', 'sans-serif'],
        'mono': ['Courier New', 'monospace'],
      },
      spacing: {
        'xs': '0.25rem',
        'sm': '0.5rem',
        'md': '1rem',
        'lg': '1.5rem',
        'xl': '2rem',
        '2xl': '3rem',
      },
      borderRadius: {
        'none': '0',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'full': '9999px',
      },
      boxShadow: {
        'sm': '0 2px 4px rgba(0, 0, 0, 0.1)',
        'md': '0 4px 12px rgba(0, 0, 0, 0.15)',
        'lg': '0 12px 32px rgba(0, 0, 0, 0.2)',
        'orange': '0 0 20px rgba(255, 107, 53, 0.3)',
      },
    },
  },
  plugins: [],
}
