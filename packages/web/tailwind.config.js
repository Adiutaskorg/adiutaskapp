/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
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
          300: "#c8cbd6",
          400: "#a1a5b4",
          500: "#7d8291",
          600: "#5c6070",
          700: "#2a2d3a",
          800: "#1e2030",
          850: "#191b28",
          900: "#141520",
          950: "#0f0f1a",
        },
        accent: {
          success: "#22c55e",
          "success-muted": "#16a34a",
          warning: "#f59e0b",
          "warning-muted": "#d97706",
          danger: "#ef4444",
          "danger-muted": "#dc2626",
          info: "#3b82f6",
          "info-muted": "#2563eb",
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
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        "notion": "0 1px 3px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.1)",
        "notion-md": "0 2px 8px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)",
        "notion-lg": "0 8px 24px rgba(0,0,0,0.16), 0 0 1px rgba(0,0,0,0.06)",
        "card": "0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.03)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
        "glow-brand": "0 0 20px rgba(64,96,247,0.15)",
        "glow-success": "0 0 20px rgba(34,197,94,0.15)",
      },
      transitionTimingFunction: {
        "smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
        "bounce-sm": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "typing-dot": "typingDot 1.4s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "gradient": "gradient 6s ease infinite",
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
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        gradient: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
};
