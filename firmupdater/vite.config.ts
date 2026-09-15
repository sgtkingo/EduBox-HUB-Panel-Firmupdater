import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this project below the repository name.
  base: '/EduBox-HUB-Panel-Firmupdater/',
})
