import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fixed: "#6366f1",
        flex: "#f59e0b",
        personal: "#10b981",
      },
    },
  },
  plugins: [],
};
export default config;
