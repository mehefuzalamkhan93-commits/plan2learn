/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#09090b', // zinc-950
        panel: '#18181b',      // zinc-900
        border: '#27272a',     // zinc-800
        text: '#fafafa',       // zinc-50
        'text-muted': '#a1a1aa', // zinc-400
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [
    function ({ addVariant }) {
      addVariant('light', ':is(.light, [data-theme="light"]) &');
    },
  ],
};
