module.exports = {
  content: [
    './renderer/**/*.{js,jsx,ts,tsx}',
    './premium/renderer/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          elevated: 'var(--bg-elevated)',
          input: 'var(--bg-input)',
          sidebar: 'var(--bg-sidebar)',
          main: 'var(--bg-main)',
          card: 'var(--bg-card)',
          component: 'var(--bg-component)',
          'toggle-switch': 'var(--bg-toggle-switch)',
          'item-surface': 'var(--bg-item-surface)',
          'item-active': 'var(--bg-item-active)',
        },
        button: {
          primary: {
            bg: 'var(--btn-primary-bg)',
            hover: 'var(--btn-primary-hover)',
            'disabled-bg': 'var(--btn-primary-disabled-bg)',
            'disabled-border': 'var(--btn-primary-disabled-border)',
            'disabled-text': 'var(--btn-primary-disabled-text)',
            'shadow-color': 'var(--btn-primary-shadow-color)',
          },
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
        },
        background: 'var(--bg-main)',
        foreground: 'var(--text-primary)',
        card: { DEFAULT: 'var(--bg-card)', foreground: 'var(--text-primary)' },
        popover: {
          DEFAULT: 'var(--bg-card)',
          foreground: 'var(--text-primary)',
        },
        primary: { DEFAULT: 'var(--btn-primary-bg)', foreground: '#ffffff' },
        secondary: {
          DEFAULT: 'var(--bg-component)',
          foreground: 'var(--text-primary)',
        },
        muted: {
          DEFAULT: 'var(--bg-item-surface)',
          foreground: 'var(--text-secondary)',
        },
        accent: {
          DEFAULT: 'var(--bg-item-active)',
          foreground: 'var(--text-primary)',
          primary: 'var(--accent-primary)',
          secondary: 'var(--accent-muted)',
        },
        destructive: { DEFAULT: '#ef4444', foreground: '#ffffff' },
        ring: 'var(--accent-primary)',
        input: 'var(--border-muted)',
        border: {
          DEFAULT: 'var(--border-muted)',
          subtle: 'var(--border-subtle)',
          muted: 'var(--border-muted)',
        },
      },
      spacing: {
        0.5: '2px',
        1: '4px',
        1.5: '6px',
        2: '8px',
        2.5: '10px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
        sm: '4px',
        xl: '16px',
        '2xl': '24px',
        pill: '9999px',
      },
      fontSize: {
        xxs: ['9.5px', { lineHeight: '1.4' }],
        xs: ['10px', { lineHeight: '1.4' }],
        sm: ['11.5px', { lineHeight: '1.5' }],
        base: ['13px', { lineHeight: '1.5' }],
        lg: ['15px', { lineHeight: '1.6' }],
        xl: ['18px', { lineHeight: '1.5' }],
        '2xl': ['22px', { lineHeight: '1.3' }],
      },
      boxShadow: {
        'glass-sm':
          '0 1px 3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-md':
          '0 4px 12px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.08)',
        'glass-lg':
          '0 8px 24px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.10)',
        'glass-xl':
          '0 12px 40px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.12)',
      },
      blur: {
        'glass-sm': '6px',
        'glass-md': '12px',
        'glass-lg': '24px',
        'glass-xl': '40px',
      },
      zIndex: {
        base: '0',
        overlay: '10',
        dropdown: '100',
        modal: '1000',
        toast: '2000',
        drag: '9999',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        celeb: ['CelebMF', 'sans-serif'],
        'celeb-light': ['CelebMFLight', 'sans-serif'],
      },
      transitionTimingFunction: {
        'apple-ease': 'cubic-bezier(0.25, 1, 0.5, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        sculpted: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        in: 'in 0.2s ease-out',
        out: 'out 0.2s ease-in',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s linear infinite',
        'text-gradient-wave': 'textGradientWave 2s infinite ease-in-out',
        'fade-in-up': 'fadeInUp 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        textGradientWave: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        in: {
          '0%': { transform: 'translateY(100%)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        out: {
          '0%': { transform: 'translateY(0)', opacity: 1 },
          '100%': { transform: 'translateY(100%)', opacity: 0 },
        },
        pulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
        fadeInUp: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: 0, transform: 'scale(0.95)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
