// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  // Configure the paths to all of your HTML templates and JavaScript components
  // Tailwind will scan these files for class names and generate the necessary CSS.
  content: [
    "./index.html",      // Scan the main HTML file
    "./js/**/*.js",      // Scan all JavaScript files in the js folder
  ],
  // Enable dark mode using the 'class' strategy
  // (The 'dark' class will be added/removed from the <html> element by ui.js)
  darkMode: 'class',
  theme: {
    extend: {
      // You can add custom theme extensions here later if needed
      // colors: {},
      // fontFamily: {},
    },
  },
  plugins: [
    // You can add Tailwind plugins here later if needed
    // require('@tailwindcss/forms'),
  ],
}
