/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      lineHeight: {
        relaxed: '1.55',
        spacious: '1.6',
      },
    },
  },
  plugins: [],
};
