import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import * as authApi from '../api/auth'
import { REFRESH_KEY, setUnauthorizedHandler, TOKEN_KEY } from '../api/http'
import * as meApi from '../api/me'
import * as siteApi from '../api/site'
import { ASPECT_RATIO_TO_SIZE, applyRatioPrefix, type AspectRatio, type UpscaleLevel } from '../features/image/options'

export type TabKey = 'home' | 'generate' | 'history' | 'profile'
export type BootstrapStatus = 'idle' | 'loading' | 'ready' | 'error'
export type { AspectRatio, UpscaleLevel } from '../features/image/options'

export interface HistoryRecord extends meApi.ImageTask {}

const defaultSiteInfo: Record<string, string> = {
  'site.name': 'GPT2API',
  'site.description': 'AI 创作平台',
  'site.logo_url': '',
  'site.footer': '',
  'site.image_notice': '',
  'auth.allow_register': 'true',
}

function isProtectedTab(tab: TabKey) {
  return tab === 'generate' || tab === 'history' || tab === 'profile'
}

function allowRegister(siteInfo: Record<string, string>) {
  const value = (siteInfo['auth.allow_register'] || '').toLowerCase()
  return value === 'true' || value === '1' || value === 'yes'
}

function applySiteInfo(siteInfo: Record<string, string>) {
  const siteName = siteInfo['site.name'] || 'GPT2API'
  document.title = siteName
  const logo = siteInfo['site.logo_url']
  if (!logo) return
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = logo
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

function normalizeImageCount(count?: number) {
  return Math.min(Math.max(count ?? 1, 1), 4)
}

interface AppState {
  siteInfo: Record<string, string>
  bootstrapStatus: BootstrapStatus
  user: authApi.UserInfo | null
  role: string
  permissions: string[]
  checkin: meApi.CheckinStatus | null
  imageModels: meApi.ImageModel[]
  selectedImageModel: string | null
  history: HistoryRecord[]
  historyLoaded: boolean
  historyLoading: boolean
  isDark: boolean
  activeTab: TabKey
  pendingTab: TabKey
  authOverlayOpen: boolean

  bootstrapApp: () => Promise<void>
  fetchSiteInfo: () => Promise<void>
  login: (input: authApi.LoginReq) => Promise<void>
  register: (input: authApi.RegisterReq) => Promise<void>
  logout: () => void
  forceRelogin: (tab: TabKey) => void
  fetchMe: () => Promise<authApi.UserInfo | null>
  fetchCheckin: () => Promise<meApi.CheckinStatus | null>
  fetchImageModels: () => Promise<meApi.ImageModel[]>
  fetchHistory: (force?: boolean) => Promise<HistoryRecord[]>
  submitCheckin: () => Promise<meApi.CheckinStatus>
  setSelectedImageModel: (model: string | null) => void
  generateImage: (input: { prompt: string; aspectRatio: AspectRatio; upscale?: UpscaleLevel; count?: number; signal?: AbortSignal }) => Promise<meApi.PlayImageResponse>
  editImage: (input: { prompt: string; aspectRatio: AspectRatio; upscale?: UpscaleLevel; file: File; count?: number; signal?: AbortSignal }) => Promise<meApi.PlayImageResponse>
  openAuthForTab: (tab: TabKey) => void
  closeAuth: () => void
  setActiveTab: (tab: TabKey) => void
  toggleTheme: () => void
  handleUnauthorized: () => void
}

async function applyLoginSession(get: () => AppState, set: (partial: Partial<AppState>) => void, session: authApi.LoginResp) {
  localStorage.setItem(TOKEN_KEY, session.token.access_token)
  localStorage.setItem(REFRESH_KEY, session.token.refresh_token)
  set({
    user: session.user,
    role: session.user.role,
  })
  await get().fetchMe()
  await Promise.allSettled([get().fetchCheckin(), get().fetchImageModels()])
  const nextTab = get().pendingTab || get().activeTab
  set({
    authOverlayOpen: false,
    activeTab: nextTab,
    pendingTab: nextTab,
  })
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      siteInfo: defaultSiteInfo,
      bootstrapStatus: 'idle',
      user: null,
      role: '',
      permissions: [],
      checkin: null,
      imageModels: [],
      selectedImageModel: null,
      history: [],
      historyLoaded: false,
      historyLoading: false,
      isDark: true,
      activeTab: 'home',
      pendingTab: 'home',
      authOverlayOpen: false,

      async fetchSiteInfo() {
        try {
          const info = await siteApi.fetchSiteInfo()
          const merged = { ...defaultSiteInfo, ...info }
          set({
            siteInfo: merged,
            authOverlayOpen: allowRegister(merged) ? get().authOverlayOpen : get().authOverlayOpen,
          })
          applySiteInfo(merged)
        } catch {
          applySiteInfo(get().siteInfo)
        }
      },

      async bootstrapApp() {
        if (get().bootstrapStatus === 'loading') return
        set({ bootstrapStatus: 'loading' })
        try {
          await get().fetchSiteInfo()
          if (!localStorage.getItem(TOKEN_KEY)) {
            set({ bootstrapStatus: 'ready' })
            return
          }
          await get().fetchMe()
          await Promise.allSettled([get().fetchCheckin(), get().fetchImageModels()])
          set({ bootstrapStatus: 'ready' })
        } catch {
          set({ bootstrapStatus: 'error' })
        }
      },

      async login(input) {
        const session = await authApi.login(input)
        await applyLoginSession(get, set, session)
      },

      async register(input) {
        if (!allowRegister(get().siteInfo)) {
          throw new Error('当前站点已关闭注册')
        }
        await authApi.register(input)
        const session = await authApi.login({ email: input.email, password: input.password })
        await applyLoginSession(get, set, session)
      },

      logout() {
        clearTokens()
        set({
          user: null,
          role: '',
          permissions: [],
          checkin: null,
          imageModels: [],
          selectedImageModel: null,
          history: [],
          historyLoaded: false,
          historyLoading: false,
          authOverlayOpen: false,
          activeTab: 'home',
          pendingTab: 'home',
          bootstrapStatus: 'ready',
        })
      },

      forceRelogin(tab) {
        clearTokens()
        set({
          user: null,
          role: '',
          permissions: [],
          checkin: null,
          imageModels: [],
          selectedImageModel: null,
          history: [],
          historyLoaded: false,
          historyLoading: false,
          authOverlayOpen: true,
          activeTab: 'home',
          pendingTab: tab,
          bootstrapStatus: 'ready',
        })
      },

      async fetchMe() {
        const data = await meApi.getMe()
        set({
          user: data.user,
          role: data.role,
          permissions: data.permissions || [],
        })
        return data.user
      },

      async fetchCheckin() {
        const data = await meApi.getMyCheckinStatus()
        set({ checkin: data })
        return data
      },

      async fetchImageModels() {
        const data = await meApi.listMyModels()
        const available = (data.items || []).filter((item) => item.type === 'image')
        const current = get().selectedImageModel
        const selectedImageModel = available.some((item) => item.slug === current)
          ? current
          : available[0]?.slug ?? null
        set({ imageModels: available, selectedImageModel })
        return available
      },

      async fetchHistory(force = false) {
        if (get().historyLoaded && !force) {
          return get().history
        }
        set({ historyLoading: true })
        try {
          const data = await meApi.listMyImageTasks({ limit: 20, offset: 0 })
          set({ history: data.items || [], historyLoaded: true, historyLoading: false })
          return data.items || []
        } catch (error) {
          set({ historyLoading: false })
          throw error
        }
      },

      async submitCheckin() {
        const result = await meApi.checkinToday()
        set({ checkin: result })
        await Promise.allSettled([get().fetchMe(), get().fetchCheckin()])
        return result
      },

      setSelectedImageModel(model) {
        set({ selectedImageModel: model })
      },

      async generateImage(input) {
        const model = get().selectedImageModel || (await get().fetchImageModels())[0]?.slug
        if (!model) {
          throw new Error('当前暂无可用图像模型')
        }
        const result = await meApi.playGenerateImage(
          {
            model,
            prompt: applyRatioPrefix(input.prompt, input.aspectRatio),
            size: ASPECT_RATIO_TO_SIZE[input.aspectRatio],
            upscale: input.upscale || undefined,
            n: normalizeImageCount(input.count),
          },
          input.signal,
        )
        await Promise.allSettled([get().fetchMe(), get().fetchHistory(true)])
        return result
      },

      async editImage(input) {
        const model = get().selectedImageModel || (await get().fetchImageModels())[0]?.slug
        if (!model) {
          throw new Error('当前暂无可用图像模型')
        }
        const result = await meApi.playEditImage(
          model,
          applyRatioPrefix(input.prompt, input.aspectRatio),
          input.file,
          {
            size: ASPECT_RATIO_TO_SIZE[input.aspectRatio],
            upscale: input.upscale || undefined,
            n: normalizeImageCount(input.count),
            signal: input.signal,
          },
        )
        await Promise.allSettled([get().fetchMe(), get().fetchHistory(true)])
        return result
      },

      openAuthForTab(tab) {
        set({ authOverlayOpen: true, pendingTab: tab })
      },

      closeAuth() {
        set({ authOverlayOpen: false, pendingTab: get().activeTab })
      },

      setActiveTab(tab) {
        set({ activeTab: tab })
      },

      toggleTheme() {
        set((state) => ({ isDark: !state.isDark }))
      },

      handleUnauthorized() {
        const activeTab = get().activeTab
        set({
          user: null,
          role: '',
          permissions: [],
          checkin: null,
          imageModels: [],
          selectedImageModel: null,
          history: [],
          historyLoaded: false,
          historyLoading: false,
          activeTab: isProtectedTab(activeTab) ? 'home' : activeTab,
          pendingTab: isProtectedTab(activeTab) ? activeTab : 'home',
          authOverlayOpen: true,
          bootstrapStatus: 'ready',
        })
        toast.error('登录已失效，请重新登录')
      },
    }),
    {
      name: 'wap-backend-storage',
      partialize: (state) => ({
        isDark: state.isDark,
        selectedImageModel: state.selectedImageModel,
      }),
    },
  ),
)

setUnauthorizedHandler(() => {
  clearTokens()
  useStore.getState().handleUnauthorized()
})
