import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('admin 菜单前端直接消费后端返回的一级分组、二级页面结构', () => {
  const storeTs = read('admin/src/stores/user.ts')

  assert.match(storeTs, /const adminMenu = computed<authApi\.MenuItem\[\]>\(\(\) => menu\.value\)/)
  assert.match(storeTs, /menu\.value = data\.menu \|\| \[\]/)
  assert.doesNotMatch(storeTs, /function buildAdminMenu\(items: authApi\.MenuItem\[\]\)/)
  assert.doesNotMatch(storeTs, /const adminGroup = items\.find\(\(item\) => item\.key === 'admin'\)/)
})

test('admin 菜单支持后台概览作为一级菜单项展示', () => {
  const layoutVue = read('admin/src/layouts/BasicLayout.vue')

  assert.match(layoutVue, /<el-menu-item v-if="!group\.children\?\.length && group\.path" :index="group\.path">/)
  assert.match(layoutVue, /<template v-for="group in adminMenu"/)
})

test('admin 布局按一级分组、二级菜单项展示', () => {
  const layoutVue = read('admin/src/layouts/BasicLayout.vue')

  assert.match(layoutVue, /<template v-for="group in adminMenu"/)
  assert.match(layoutVue, /<el-sub-menu v-else-if="group\.children\?\.length" :index="group\.key">/)
  assert.match(layoutVue, /<el-menu-item v-for="child in group\.children"/)
  assert.doesNotMatch(layoutVue, /<el-menu-item-group v-else-if="child\.children\?\.length">/)
  assert.doesNotMatch(layoutVue, /grandchild/)
})
