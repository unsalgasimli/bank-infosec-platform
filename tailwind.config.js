/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        wrike: {
          green: '#00B259',        // Primary Wrike Emerald Green Brand & CTA
          greenHover: '#00964B',   // Darker green hover
          greenLight: '#E6F7EF',   // Light green pill / lozenge
          greenDark: '#007860',    // Dark teal green
          greenAccent: '#00E05C',  // Bright accent green
          midnight: '#162136',     // Deep Wrike Midnight Navy
          midnightFair: '#2B3A57', // Secondary dark text / surfaces
          midnightMiddle: '#5A6A85', // Muted secondary text
          midnightLight: '#8D99AE',// Subtle gray text / icon
          bg: '#F4F6FB',           // Main canvas light background
          surface: '#FFFFFF',      // White surface cards
          surfaceSecondary: '#F8FAFC', // Light hover surface
          border: '#E2E8F0',       // Main neutral border
          borderSubtle: '#EDF2F7', // Subtle card divider
          blue: '#0073D3',         // Wrike Action Blue
          blueLight: '#EBF4FD',    // Blue pill / lozenge
          red: '#E51739',          // Critical / Breach Red
          redLight: '#FDE8EB',     // Red pill / lozenge
          amber: '#FA8C16',        // Warning Amber
          amberLight: '#FFF7E6',   // Amber pill / lozenge
          purple: '#722ED1',       // High Tier Purple
          purpleLight: '#F9F0FF',  // Purple pill / lozenge
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'wrike-xs': '0 1px 2px 0 rgba(22, 33, 54, 0.04)',
        'wrike-sm': '0 1px 3px 0 rgba(22, 33, 54, 0.06), 0 1px 2px 0 rgba(22, 33, 54, 0.04)',
        'wrike-md': '0 4px 6px -1px rgba(22, 33, 54, 0.08), 0 2px 4px -1px rgba(22, 33, 54, 0.04)',
        'wrike-lg': '0 10px 15px -3px rgba(22, 33, 54, 0.09), 0 4px 6px -2px rgba(22, 33, 54, 0.04)',
      },
    },
  },
  plugins: [],
}
