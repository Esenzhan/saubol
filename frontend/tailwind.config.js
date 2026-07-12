export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        paper: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        moss: "rgb(var(--accent) / <alpha-value>)",
        amber: "rgb(var(--pending) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        onaccent: "rgb(var(--on-accent) / <alpha-value>)",
        sage: "#8FB09E",
      },
      fontFamily: {
        display: ["'Inter'", "-apple-system", "system-ui", "sans-serif"],
        body: ["'Inter'", "-apple-system", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
