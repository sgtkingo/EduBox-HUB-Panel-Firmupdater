/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mta: {
          blue: '#055da9',
          dark: '#034477',
          orange: '#eb6209',
          orangeDark: '#c84f00',
          ink: '#17324d',
          mist: '#eef5fa',
        },
      },
    },
  },
  plugins: [],
}
