import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import BasicLayout from '@/layouts/BasicLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { useUserStore } from '@/stores/user'

/**
 * 路由约定:
 *
 *   meta.public    true  不需要登录
 *   meta.perm      string | string[]  需要任一权限
 *   meta.title     浏览器标签标题
 *
 * 这是前端静态路由表。后端 /api/me/menu 返回的是 UI 菜单,两者并不强绑定:
 * 即便菜单不显示,只要用户输入了正确 URL 且持有权限,也能访问对应页面。
 * 真正的守门人在后端 middleware.RequirePerm,前端只是体验优化。
 */
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/login', meta: { public: true } },
  {
    path: '/login',
    component: BlankLayout,
    children: [
      { path: '', component: () => import('@/views/auth/Login.vue'), meta: { public: true, title: '登录后台' } },
    ],
  },
  { path: '/register', redirect: '/login', meta: { public: true } },
  { path: '/pricing', redirect: '/login', meta: { public: true } },
  { path: '/showcase', redirect: '/login', meta: { public: true } },
  { path: '/personal/:pathMatch(.*)*', redirect: '/login', meta: { public: true } },
  {
    path: '/admin',
    component: BasicLayout,
    redirect: '/admin/dashboard',
    children: [
      { path: 'dashboard', component: () => import('@/views/admin/Dashboard.vue'), meta: { title: '后台概览' } },
      { path: 'users', component: () => import('@/views/admin/Users.vue'),
        meta: { title: '用户管理', perm: 'user:read' } },
      { path: 'credits', component: () => import('@/views/admin/Credits.vue'),
        meta: { title: '积分管理', perm: 'user:credit' } },
      { path: 'recharges', component: () => import('@/views/admin/Recharges.vue'),
        meta: { title: '充值订单', perm: 'recharge:manage' } },
      { path: 'redeem-codes', component: () => import('@/views/admin/RedeemCodes.vue'),
        meta: { title: '兑换码', perm: 'recharge:manage' } },
      { path: 'accounts', component: () => import('@/views/admin/Accounts.vue'),
        meta: { title: 'GPT账号', perm: 'account:read' } },
      { path: 'proxies', component: () => import('@/views/admin/Proxies.vue'),
        meta: { title: '代理管理', perm: 'proxy:read' } },
      { path: 'models', component: () => import('@/views/admin/Models.vue'),
        meta: { title: '模型配置', perm: ['model:read', 'model:write'] } },
      { path: 'channels', component: () => import('@/views/admin/Channels.vue'),
        meta: { title: '上游渠道', perm: ['channel:read', 'channel:write'] } },
      { path: 'groups', component: () => import('@/views/admin/Groups.vue'),
        meta: { title: '用户分组', perm: 'group:write' } },
      { path: 'usage', component: () => import('@/views/admin/UsageStats.vue'),
        meta: { title: '用量统计', perm: 'usage:read_all' } },
      { path: 'image-tasks', component: () => import('@/views/admin/ImageTasks.vue'),
        meta: { title: '图片任务', perm: 'usage:read_all' } },
      { path: 'keys', component: () => import('@/views/admin/AdminKeys.vue'),
        meta: { title: '全局 Keys', perm: 'key:read_all' } },
      { path: 'audit', component: () => import('@/views/admin/Audit.vue'),
        meta: { title: '审计日志', perm: 'audit:read' } },
      { path: 'backup', component: () => import('@/views/admin/Backup.vue'),
        meta: { title: '数据备份', perm: 'system:backup' } },
      { path: 'image-files', component: () => import('@/views/admin/ImageFiles.vue'),
        meta: { title: '图片文件', perm: 'system:image_file' } },
      { path: 'announcements', component: () => import('@/views/admin/Announcements.vue'),
        meta: { title: '公告管理', perm: 'system:setting' } },
      { path: 'settings', component: () => import('@/views/admin/Settings.vue'),
        meta: { title: '系统设置', perm: 'system:setting' } },
    ],
  },
  {
    path: '/403',
    component: () => import('@/views/Error403.vue'),
    meta: { public: true, title: '403' },
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/Error404.vue'),
    meta: { public: true, title: '404' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const store = useUserStore()
  const title = (to.meta.title as string) || 'GPT2API 后台'
  document.title = title

  if (to.path === '/login' && store.isLoggedIn) {
    try {
      await store.fetchMe()
      await store.assertAdminAccess()
      return { path: '/admin/dashboard' }
    } catch {
      store.clear()
      return true
    }
  }

  if (to.meta.public) return true

  if (!store.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  try {
    await store.fetchMe()
    await store.assertAdminAccess()
  } catch {
    store.clear()
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  const perm = to.meta.perm as string | string[] | undefined
  if (perm && !store.hasPerm(perm)) {
    return { path: '/403' }
  }
  return true
})

export default router
