import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FAFAF7",
        surface: "#FFFFFF",
        ink: "#0E0E0C",
        "ink-2": "#2B2B26",
        muted: "#6B6A63",
        "muted-2": "#9A998F",
        line: "#E8E6DF",
        "line-2": "#F0EEE8",
        sidebar: "#F6F4EC",
        surface2: "#FBFAF5",
        accent: "oklch(0.62 0.14 150)",
        "accent-soft": "oklch(0.96 0.03 150)",
        "accent-ink": "oklch(0.35 0.10 150)",
        warn: "oklch(0.72 0.13 70)",
        "warn-soft": "oklch(0.97 0.04 80)",
        "warn-ink": "oklch(0.45 0.10 70)",
        danger: "oklch(0.60 0.17 25)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "Menlo", "monospace"],
      },
      borderRadius: { DEFAULT: "6px", lg: "10px" },
      letterSpacing: { tight2: "-0.02em", tight3: "-0.035em" },
    },
  },
  plugins: [],
};
export default config;
