import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('Dockerfile 同时复制 admin 与 web 两套前端产物', () => {
  const dockerfile = read('deploy/Dockerfile')
  assert.match(dockerfile, /COPY admin\/dist \/app\/admin\/dist/)
  assert.match(dockerfile, /COPY web\/dist \/app\/web\/dist/)
})

test('本地预编译脚本同时构建 admin 与 web', () => {
  const sh = read('deploy/build-local.sh')
  const ps1 = read('deploy/build-local.ps1')
  assert.match(sh, /step3 = npm run build \(admin\)/)
  assert.match(sh, /step4 = npm run build \(web\)/)
  assert.match(sh, /admin\/dist\/index\.html/)
  assert.match(sh, /web\/dist\/index\.html/)
  assert.match(ps1, /step3 = npm run build \(admin\)/)
  assert.match(ps1, /step4 = npm run build \(web\)/)
  assert.match(ps1, /admin\/dist\/index\.html/)
  assert.match(ps1, /web\/dist\/index\.html/)
})

test('本地预编译脚本会在锁文件更新后重新安装前端依赖', () => {
  const sh = read('deploy/build-local.sh')
  const ps1 = read('deploy/build-local.ps1')

  assert.match(sh, /node_modules\/\.package-lock\.json/)
  assert.match(sh, /package-lock\.json/)
  assert.match(ps1, /node_modules\/\.package-lock\.json/)
  assert.match(ps1, /package-lock\.json/)
})

test('Nginx 示例同时声明 admin 与 web 用户端域名并透传 Host', () => {
  const nginx = read('deploy/nginx.conf')
  assert.match(nginx, /server_name admin\.domain\.com;/)
  assert.match(nginx, /server_name img\.domain\.com;/)
  assert.match(nginx, /proxy_set_header Host \$host;/)
})

test('部署文档使用新的 web 用户端域名设置键', () => {
  const readme = read('deploy/README.md')
  assert.match(readme, /site\.web_domain/)
  assert.doesNotMatch(readme, /site\.wap_domain/)
  assert.match(readme, /admin\/dist\/index\.html/)
  assert.match(readme, /web\/dist\/index\.html/)
  assert.doesNotMatch(readme, /wap\/dist/)
  assert.doesNotMatch(readme, /imgwap\.domain\.com/)
})

test('根 README 使用 admin 与 web 目录命名', () => {
  const readme = read('README.md')
  assert.match(readme, /admin\/dist\/index\.html/)
  assert.match(readme, /web\/dist\/index\.html/)
  assert.match(readme, /site\.web_domain/)
  assert.match(readme, /admin\.domain\.com\s*->\s*admin 站点/)
  assert.match(readme, /img\.domain\.com\s*->\s*web 用户端站点/)
  assert.doesNotMatch(readme, /site\.wap_domain/)
  assert.doesNotMatch(readme, /wap\/dist/)
  assert.doesNotMatch(readme, /imgwap\.domain\.com/)
})

test('前端 README 与包元数据使用新的目录命名', () => {
  const adminReadme = read('admin/README.md')
  const webReadme = read('web/README.md')
  const adminPackage = read('admin/package.json')

  assert.match(adminReadme, /cd admin/)
  assert.match(adminReadme, /admin\/dist/)
  assert.doesNotMatch(adminReadme, /\bWAP\b/)
  assert.doesNotMatch(adminReadme, /`web\/`/)

  assert.match(webReadme, /cd web/)
  assert.match(webReadme, /web\/dist/)
  assert.doesNotMatch(webReadme, /AI Studio/)
  assert.doesNotMatch(webReadme, /GEMINI_API_KEY/)
  assert.doesNotMatch(webReadme, /\bWAP\b/)

  assert.match(adminPackage, /"directory": "admin"/)
})
