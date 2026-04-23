import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('Dockerfile 同时复制 web 与 wap 两套前端产物', () => {
  const dockerfile = read('deploy/Dockerfile')
  assert.match(dockerfile, /COPY web\/dist \/app\/web\/dist/)
  assert.match(dockerfile, /COPY wap\/dist \/app\/wap\/dist/)
})

test('本地预编译脚本同时构建 web 与 wap', () => {
  const sh = read('deploy/build-local.sh')
  const ps1 = read('deploy/build-local.ps1')
  assert.match(sh, /step4 = npm run build \(wap\)/)
  assert.match(sh, /wap\/dist\/index\.html/)
  assert.match(ps1, /step4 = npm run build \(wap\)/)
  assert.match(ps1, /wap\/dist\/index\.html/)
})

test('Nginx 示例同时声明 web 与 wap 域名并透传 Host', () => {
  const nginx = read('deploy/nginx.conf')
  assert.match(nginx, /server_name img\.domain\.com;/)
  assert.match(nginx, /server_name imgwap\.domain\.com;/)
  assert.match(nginx, /proxy_set_header Host \$host;/)
})
