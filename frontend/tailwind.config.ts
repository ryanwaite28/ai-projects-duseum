import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:          { DEFAULT: '#0e0d0b', soft: '#1c1a16', raised: '#252220' },
        parchment:    { DEFAULT: '#f5f0e8', dim: '#ede7d9' },
        gold:         { DEFAULT: '#c8973a', light: '#e8b55a', dim: '#8a642a' },
        stone:        { DEFAULT: '#4a4540', light: '#7a7068' },
        'warm-white': '#fdfaf4',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"DM Mono"', 'monospace'],
      },
      borderRadius: {
        sm:      '2px',
        DEFAULT: '2px',
        md:      '4px',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '400': '400ms',
        '800': '800ms',
      },
      backgroundImage: {
        'hero-glow': `
          radial-gradient(ellipse 70% 60% at 50% 40%, rgba(200,151,58,0.06) 0%, transparent 70%),
          radial-gradient(ellipse 40% 50% at 20% 80%, rgba(200,151,58,0.04) 0%, transparent 60%)
        `,
        'grid-texture': `
          linear-gradient(rgba(200,151,58,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(200,151,58,0.04) 1px, transparent 1px)
        `,
      },
      animation: {
        'fade-up':    'fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':    'fadeIn 0.6s ease both',
        'float':      'float 2.5s ease-in-out infinite',
        'rotate-slow':'rotateSlow 20s linear infinite',
      },
      keyframes: {
        fadeUp:     { from: { opacity: '0', transform: 'translateY(32px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:     { from: { opacity: '0' }, to: { opacity: '1' } },
        float:      { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        rotateSlow: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
      },
    },
  },
  plugins: [],
} satisfies Config
