import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { AskError, askTwin } from './api/ask.ts'

/** Локально обслуживает /api/ask той же функцией, что и Vercel. Ключ берётся из .env.local. */
function askApiDev(env: Record<string, string>): Plugin {
  return {
    name: 'twin-ask-api',
    configureServer(server) {
      server.middlewares.use('/api/ask', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          try {
            const result = await askTwin(JSON.parse(raw || '{}'), env)
            res.end(JSON.stringify(result))
          } catch (e) {
            res.statusCode = e instanceof AskError ? e.status : 500
            res.end(JSON.stringify({ error: (e as Error).message }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  // Третий аргумент '' — загрузить все переменные, а не только VITE_*. В клиентский код они не попадают.
  plugins: [react(), tailwindcss(), askApiDev(loadEnv(mode, process.cwd(), ''))],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
}))
