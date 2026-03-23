import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const isUserOrOrgPagesRepo = repoName.endsWith('.github.io')
const ghPagesBase = repoName && !isUserOrOrgPagesRepo ? `/${repoName}/` : '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? ghPagesBase,
})
