import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Set base path for GitHub Pages or subpath deploys via env var
  // Example: VITE_BASE=/guest-suite/
  base: process.env.VITE_BASE || '/',
})
