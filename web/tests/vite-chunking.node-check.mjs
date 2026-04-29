import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')

test('web Vite build uses manual vendor chunks for large runtime dependencies', () => {
  assert.match(viteConfig, /build\s*:/, 'missing build configuration')
  assert.match(viteConfig, /manualChunks\s*\(/, 'missing manualChunks configuration')

  for (const chunkName of ['react-vendor', 'motion-vendor', 'ui-vendor', 'api-vendor']) {
    assert.match(viteConfig, new RegExp(`['"]${chunkName}['"]`), `missing ${chunkName} chunk`)
  }
})
