/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves project sites under /<repo>/; CI sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

// Strict CSP for the production build only (the dev server needs inline scripts for hot reload).
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.github.com",
  "frame-src 'self' about:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default defineConfig({
  base,
  plugins: [
    preact(),
    {
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }],
    },
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'YOURS Tuition',
        short_name: 'YOURS',
        description: 'Students, attendance, fees and receipts for a single teacher',
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: '#1f4e5f',
        background_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
