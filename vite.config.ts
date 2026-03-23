import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths are the most robust option for GitHub Pages and custom domains.
  base: process.env.VITE_BASE_PATH ?? './',
})
