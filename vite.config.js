import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Dev-only: serve public/<dir>/index.html for trailing-slash directory URLs.
// Vite's htmlFallbackMiddleware otherwise catches /blog/, /about/, etc. and
// serves the SPA's index.html before sirv can resolve the directory index.
// Production (Vercel) already serves dist/blog/index.html for /blog/ natively,
// so this plugin is dev-only and a no-op at build time.
function publicDirectoryIndex() {
  return {
    name: 'public-directory-index',
    configureServer(server) {
      const publicDir = path.resolve(server.config.publicDir)
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url || '').split('?')[0]
        if (!urlPath.endsWith('/') || urlPath === '/') return next()
        const candidate = path.resolve(path.join(publicDir, urlPath, 'index.html'))
        if (!candidate.startsWith(publicDir + path.sep)) return next()
        try {
          if (fs.statSync(candidate).isFile()) {
            const html = fs.readFileSync(candidate, 'utf-8')
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.statusCode = 200
            res.end(html)
            return
          }
        } catch {
          // file not found — fall through to Vite's normal handling
        }
        next()
      })
    },
  }
}

export default defineConfig({ plugins: [react(), publicDirectoryIndex()] })
