/**
 * Minimal static file server for Playwright e2e tests. Serves out/renderer/
 * (the production build) with correct MIME types so sqlite-wasm loads
 * correctly. No dependencies — uses only Node.js built-ins.
 *
 * Usage: node scripts/serve-static.mjs [port]
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, extname, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', 'out', 'renderer')
const PORT = parseInt(process.argv[2] ?? '4173', 10)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon'
}

function contentType(path) {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

function tryFiles(paths) {
  for (const p of paths) {
    // Build a safe relative path from URL segments, avoiding normalize() which
    // can turn a leading / into \ on Windows (treated as absolute by resolve).
    const segments = p.replace(/\\/g, '/').split('/').filter(Boolean)
    const full = resolve(ROOT, ...segments)
    if (!full.startsWith(ROOT + sep)) continue // containment
    if (existsSync(full) && statSync(full).isFile()) {
      return { data: readFileSync(full), mime: contentType(full) }
    }
  }
  return null
}

const server = createServer((_req, res) => {
  const url = new URL(_req.url ?? '/', `http://localhost:${PORT}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'

  const result = tryFiles([pathname])
  if (result) {
    res.writeHead(200, { 'Content-Type': result.mime })
    res.end(result.data)
  } else {
    // SPA fallback: serve index.html for any unmatched path.
    const fallback = tryFiles(['/index.html'])
    if (fallback) {
      res.writeHead(200, { 'Content-Type': fallback.mime })
      res.end(fallback.data)
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  }
})

server.listen(PORT, () => {
  console.log(`Static server: http://localhost:${PORT} (root: ${ROOT})`)
})

// Forward the port number to stdout so Playwright's webServer can verify it.
process.stdout.write(`http://localhost:${PORT}`)
