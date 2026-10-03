const color = (name) => `hsl(var(--${name}) / <alpha-value>)`;
const colors = Object.fromEntries([
  'background', 'foreground', 'border', 'input', 'ring',
  'card', 'popover', 'primary', 'secondary', 'muted', 'accent', 'destructive',
].map(name => [name, ['background', 'foreground', 'border', 'input', 'ring'].includes(name)
  ? color(name) : { DEFAULT: color(name), foreground: color(`${name}-foreground`) }]));

module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ...colors, chart: Object.fromEntries([1, 2, 3, 4, 5].map(i => [i, color(`chart-${i}`)])) },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: { 'accordion-down': 'accordion-down 0.2s ease-out', 'accordion-up': 'accordion-up 0.2s ease-out' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
