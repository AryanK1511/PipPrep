import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import { randomUUID } from 'node:crypto'

export default defineConfig(({ command }) => ({
  define: { 'import.meta.env.PIPPREP_BUILD_ID': JSON.stringify(command === 'serve' ? 'development' : randomUUID()) },
  server: { port: 4175, strictPort: true },
  plugins: [tanstackStart(), nitro(), react()],
}))
