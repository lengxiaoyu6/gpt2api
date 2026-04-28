import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'
import { TOKEN_KEY, REFRESH_KEY } from '@/api/http'

export const useUserStore = defineStore(
  'user',
  () => {
    const accessToken = ref<string>(localStorage.getItem(TOKEN_KEY) || '')
    const refreshToken = ref<string>(localStorage.getItem(REFRESH_KEY) || '')
    const user = ref<authApi.UserInfo | null>(null)
    const permissions = ref<string[]>([])
    const role = ref<string>('')
    const menu = ref<authApi.MenuItem[]>([])

    const isLoggedIn = computed(() => !!accessToken.value)
    const isAdmin = computed(() => role.value === 'admin')
    const adminMenu = computed<authApi.MenuItem[]>(() => buildAdminMenu(menu.value))

    function cloneMenuItem(item: authApi.MenuItem): authApi.MenuItem {
      return {
        ...item,
        children: item.children?.map(cloneMenuItem),
      }
    }

    function buildAdminMenu(items: authApi.MenuItem[]) {
      const adminGroup = items.find((item) => item.key === 'admin')
      if (!adminGroup) return []

      const children = adminGroup.children?.map(cloneMenuItem) || []
      if (!children.some((item) => item.key === 'admin.dashboard')) {
        children.unshift({
          key: 'admin.dashboard',
          title: '后台概览',
          icon: 'House',
          path: '/admin/dashboard',
        })
      }

      return [{
        ...cloneMenuItem(adminGroup),
        path: '/admin/dashboard',
        children,
      }]
    }

    function setTokens(tp: authApi.TokenPair) {
      accessToken.value = tp.access_token
      refreshToken.value = tp.refresh_token
      localStorage.setItem(TOKEN_KEY, tp.access_token)
      localStorage.setItem(REFRESH_KEY, tp.refresh_token)
    }

    async function login(email: string, password: string) {
      const data = await authApi.login({ email, password })
      setTokens(data.token)
      user.value = data.user
      // 登录后拉一次 me(得到 permissions),顺便拉 menu
      await fetchMe()
    }

    async function register(email: string, password: string, nickname?: string, emailCode?: string) {
      await authApi.register({ email, password, nickname, email_code: emailCode || undefined })
    }

    async function fetchMe() {
      const data = await authApi.getMe()
      user.value = data.user
      role.value = data.role
      permissions.value = data.permissions || []
    }

    async function fetchMenu() {
      const data = await authApi.getMenu()
      menu.value = data.menu || []
      role.value = data.role
      permissions.value = data.permissions || []
    }

    function hasPerm(perm: string | string[]): boolean {
      if (!perm) return true
      const arr = Array.isArray(perm) ? perm : [perm]
      if (arr.length === 0) return true
      return arr.some((p) => permissions.value.includes(p))
    }

    function clear() {
      accessToken.value = ''
      refreshToken.value = ''
      user.value = null
      permissions.value = []
      role.value = ''
      menu.value = []
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
    }

    async function assertAdminAccess() {
      if (role.value === 'admin') return
      clear()
      throw new Error('仅管理员可访问后台')
    }

    async function logout() {
      clear()
    }

    return {
      accessToken,
      refreshToken,
      user,
      role,
      permissions,
      menu,
      adminMenu,
      isLoggedIn,
      isAdmin,
      setTokens,
      login,
      register,
      fetchMe,
      fetchMenu,
      assertAdminAccess,
      hasPerm,
      clear,
      logout,
    }
  },
  {
    // 持久化 token 和 user,避免刷新后闪屏
    persist: {
      key: 'gpt2api.user-store',
      paths: ['accessToken', 'refreshToken', 'user', 'role', 'permissions'],
    },
  },
)
