/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        border: "var(--border-color)",
        input: "var(--border-color)",
        ring: "var(--primary)",
        background: "var(--bg-primary)",
        foreground: "var(--text-primary)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--bg-secondary)",
          foreground: "var(--text-primary)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "var(--bg-secondary)",
          foreground: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--primary-glow)",
          foreground: "var(--primary)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        // Theme custom mappings
        sidebar: "var(--bg-sidebar)",
        "sidebar-hover": "var(--bg-sidebar-hover)",
        "sidebar-text": "var(--text-sidebar)",
        "sidebar-active": "var(--text-sidebar-active)",
        textSecondary: "var(--text-secondary)",
        textMuted: "var(--text-muted)",
        emerald: {
          50: "#F7F1ED",
          100: "#EFE8E1",
          200: "#C7D3C0",
          300: "#A8B8A3",
          400: "#8FA28A",
          450: "#7A8E76",
          500: "#8FA28A",
          600: "#425042",
          700: "#334033",
          800: "#263026",
          900: "#1C221C",
          950: "#141A14",
        },
        gold: {
          50: "#FAF6ED",
          100: "#F3EBD6",
          200: "#E6D6AC",
          300: "#D9C182",
          400: "#C8A96B",
          500: "#C8A96B",
          600: "#B89758",
          700: "#96783F",
          800: "#735B2F",
          900: "#524020",
        }
      },
      borderRadius: {
        xl: "16px",
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        heading: ["Outfit", "sans-serif"],
      }
    },
  },
  plugins: [],
}
