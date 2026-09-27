/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        rigabras: {
          950: "#0f172a",
          900: "#111c34",
          700: "#1e3a5f",
          500: "#2563eb",
          100: "#dbeafe",
        },
      },
    },
  },
  plugins: [],
};
