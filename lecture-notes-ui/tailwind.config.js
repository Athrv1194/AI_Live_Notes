/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Outfit', 'sans-serif'],
        serif: ['"Playfair Display"', 'serif'],
      },
      colors: {
        cream: '#f4ebd0', // Restored to original darker cream as requested
        panel: '#1A1A1A',
        card: '#FFFFFF', // Changed to pure white as requested
        accent: '#558262', // Adjusted to match the button in the screenshot perfectly
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'), // Optional: helps style the markdown later
  ],
}
