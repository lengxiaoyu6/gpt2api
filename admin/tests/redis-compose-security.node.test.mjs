import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function redisServiceBlock() {
  const compose = read('deploy/docker-compose.yml')
  const match = compose.match(/\n  redis:\n([\s\S]*?)\n\n  server:/)
  assert.ok(match, 'redis service block should exist before server service')
  return match[1]
}

test('Redis 仅作为 Compose 内部服务，不发布到宿主机端口', () => {
  const block = redisServiceBlock()

  assert.doesNotMatch(block, /^    ports:/m)
  assert.match(block, /^    expose:\n      - "6379"/m)
})

test('Redis 支持可选密码，并同步给 server 与健康检查', () => {
  const compose = read('deploy/docker-compose.yml')
  const block = redisServiceBlock()

  assert.match(block, /REDIS_PASSWORD: \$\{REDIS_PASSWORD:-\}/)
  assert.match(block, /--requirepass "\$\$REDIS_PASSWORD"/)
  assert.match(block, /redis-cli -a "\$\$REDIS_PASSWORD" --no-auth-warning ping/)
  assert.match(compose, /GPT2API_REDIS_PASSWORD: "\$\{REDIS_PASSWORD:-\}"/)
})

test('部署环境模板不再提供 Redis 公网端口，只保留可选密码', () => {
  const env = read('deploy/.env.example')

  assert.doesNotMatch(env, /^REDIS_PORT=/m)
  assert.match(env, /^REDIS_PASSWORD=/m)
})

test('部署文档说明 Redis 不再发布宿主机端口', () => {
  const deployReadme = read('deploy/README.md')
  const rootReadme = read('README.md')

  assert.match(deployReadme, /\|\s*redis\s*\|\s*`6379`\s*\|\s*Compose 内部端口/)
  assert.match(deployReadme, /Redis 默认不发布宿主机端口/)
  assert.match(rootReadme, /Redis 在 Docker 部署中默认不发布宿主机端口/)
})
