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
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1.05rem' }],       // 12px
        'xs': ['0.84rem', { lineHeight: '1.25rem' }],        // ~13.5px
        'sm': ['0.95rem', { lineHeight: '1.4rem' }],         // ~15.2px
        'base': ['1.05rem', { lineHeight: '1.55rem' }],      // ~16.8px
        'md': ['1.125rem', { lineHeight: '1.65rem' }],       // 18px
        'lg': ['1.25rem', { lineHeight: '1.75rem' }],        // 20px
        'xl': ['1.4rem', { lineHeight: '1.9rem' }],          // 22.4px
        '2xl': ['1.7rem', { lineHeight: '2.2rem' }],         // 27.2px
        '3xl': ['2.1rem', { lineHeight: '2.6rem' }],         // 33.6px
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
