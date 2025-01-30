const { addIconSelectors } = require("@iconify/tailwind");

/** @type {import('tailwindcss').Config} */
export default {
  plugins: [addIconSelectors(["mdi", "file-icons"])],
};
