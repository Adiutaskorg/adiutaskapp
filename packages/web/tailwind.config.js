/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // UniBot brand palette
        brand: {
          50: "#eef2ff",
          100: "#dbe4ff",
          200: "#bfcfff",
          300: "#93aeff",
          400: "#6585fc",
          500: "#4060f7",
          600: "#2a3ded",
          700: "#222dd3",
          800: "#2127ab",
          900: "#1a1a6c",
          950: "#1a1a2e",
        },
        surface: {
          50: "#f8f9fc",
          100: "#f0f1f5",
          200: "#e2e4eb",
          700: "#2a2d3a",
          800: "#1e2030",
          900: "#141520",
          950: "#0f0f1a",
        },
        accent: {
          success: "#22c55e",
          warning: "#f59e0b",
          danger: "#ef4444",
          info: "#3b82f6",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "0.9rem" }],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "typing-dot": "typingDot 1.4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        typingDot: {
          "0%, 60%, 100%": { transform: "translateY(0)" },
          "30%": { transform: "translateY(-4px)" },
        },
      },
    },
  },
  plugins: [],
};
