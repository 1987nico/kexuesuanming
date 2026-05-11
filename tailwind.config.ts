import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f8f7f4",
          100: "#efece6",
          200: "#d9d4c8",
          300: "#bcb4a1",
          400: "#928873",
          500: "#6f664f",
          600: "#564f3c",
          700: "#3f3a2c",
          800: "#2a2620",
          900: "#19170f",
        },
        gold: {
          400: "#d6b37a",
          500: "#b88a45",
          600: "#8c6630",
        },
        danger: {
          400: "#e87264",
          500: "#cc4a3a",
          600: "#9c2a1d",
        },
      },
      fontFamily: {
        serif: ["'Noto Serif SC'", "ui-serif", "Georgia", "serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "'PingFang SC'", "'Helvetica Neue'", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
