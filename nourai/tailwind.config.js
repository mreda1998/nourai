/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './constants/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Primary backgrounds
        bone: '#E9E6DF',
        'bone-card': '#F2F0EB',
        'bone-dark': '#D6D3CC',
        'bone-warm': '#EFEDE8',
        'card-pure': '#FAF9F6',

        // Ink colors (solid only — RGBA variants stay as inline style)
        ink: '#1C1C1C',
        'ink-warm': '#1A1918',
        'text-muted': '#585754',

        // Accent colors
        'accent-clay': '#8C6A54',
        'accent-moss': '#5C6E5C',
        'accent-hill': '#2F362F',
        'accent-alert': '#A34E4E',

        // Alert
        'alert-bg': '#FDF1F1',
        'alert-text': '#5C2B2B',

        // Semantic
        success: '#5C6E5C',
        warning: '#8C6A54',
        error: '#A34E4E',
      },

      fontFamily: {
        serif: ['CormorantGaramond_400Regular'],
        'serif-medium': ['CormorantGaramond_500Medium'],
        'serif-italic': ['CormorantGaramond_400Regular_Italic'],
        sans: ['Manrope_400Regular'],
        'sans-light': ['Manrope_300Light'],
        'sans-medium': ['Manrope_500Medium'],
        'sans-semibold': ['Manrope_600SemiBold'],
      },

      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
        'screen-x': '24px',
      },

      borderRadius: {
        sm: '4px',
        md: '12px',
        lg: '24px',
        xl: '32px',
        pill: '100px',
        arch: '180px',
        full: '9999px',
      },

      fontSize: {
        caption: ['11px', { lineHeight: '15px' }],
        body: ['12px', { lineHeight: '18px' }],
        'body-lg': ['14px', { lineHeight: '21px' }],
        subtitle: ['15px', { lineHeight: '22px' }],
        title: ['18px', { lineHeight: '24px' }],
        heading: ['24px', { lineHeight: '32px' }],
        display: ['28px', { lineHeight: '34px' }],
        hero: ['36px', { lineHeight: '40px' }],
        giant: ['42px', { lineHeight: '46px' }],
      },
    },
  },
  plugins: [],
};
