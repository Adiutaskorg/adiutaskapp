/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
          800: "#92400E",
          900: "#78350F",
          950: "#451A03",
        },
        surface: {
          50: "#E8EEF5",
          100: "#D1DDEA",
          200: "#B0C3D6",
          300: "#8AA4BD",
          400: "#6786A3",
          500: "#4D6B89",
          600: "#3B5470",
          700: "#293D55",
          800: "#1C2E45",
          850: "#15243A",
          900: "#101C30",
          950: "#0B1424",
        },
        cream: {
          50: "#FDFBF7",
          100: "#F8F3EB",
          200: "#F0E9DD",
          300: "#E2D8C8",
          400: "#C8BAA4",
        },
        accent: {
          success: "#34D399",
          "success-muted": "#10B981",
          warning: "#FBBF24",
          "warning-muted": "#F59E0B",
          danger: "#F87171",
          "danger-muted": "#EF4444",
          info: "#60A5FA",
          "info-muted": "#3B82F6",
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
        "card": "0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(248,243,235,0.04)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(248,243,235,0.07)",
        "glow-brand": "0 0 20px rgba(245,158,11,0.2)",
        "glow-success": "0 0 20px rgba(52,211,153,0.15)",
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
