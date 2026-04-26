<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useSiteStore } from '@/stores/site'
import { useUserStore } from '@/stores/user'
import { formatCredit } from '@/utils/format'
import {
  listMyModels,
  streamPlayChat,
  playGenerateImage,
  type SimpleModel,
  type PlayChatMessage,
  type PlayImageData,
} from '@/api/me'
import { ENABLE_CHAT_MODEL } from '@/config/feature'

// ----------------------------------------------------
// 用户 / 模型
// ----------------------------------------------------
const userStore = useUserStore()
const siteStore = useSiteStore()
const { user } = storeToRefs(userStore)

const balance = computed(() => formatCredit(user.value?.credit_balance))

const models = ref<SimpleModel[]>([])
const chatModels = computed(() => models.value.filter((m) => m.type === 'chat'))
const imageModels = computed(() => models.value.filter((m) => m.type === 'image'))

const selectedChatModel = ref('')
const selectedImageModel = ref('')

function pickPreferredImageModel(models: SimpleModel[], current?: string) {
  const available = models.filter((item) => item.type === 'image')
  if (current && available.some((item) => item.slug === current)) {
    return current
  }
  return available.find((item) => item.has_image_channel)?.slug ?? available[0]?.slug ?? ''
}

const currentChatDesc = computed(
  () => chatModels.value.find((m) => m.slug === selectedChatModel.value)?.description || '',
)
const currentImageModel = computed(
  () => imageModels.value.find((m) => m.slug === selectedImageModel.value),
)
const currentImageDesc = computed(() => currentImageModel.value?.description || '')
const supportsMultiImage = computed(() => currentImageModel.value?.supports_multi_image ?? true)
const supportsOutputSize = computed(() => currentImageModel.value?.supports_output_size ?? true)
const effectiveT2iN = computed(() => supportsMultiImage.value ? t2iN.value : 1)
const effectiveI2iN = computed(() => 1)
const noticeText = computed(() => siteStore.get('site.image_notice'))

onMounted(async () => {
  try {
    await userStore.fetchMe()
  } catch {
    /* ignore */
  }
  try {
    const m = await listMyModels()
    // feature flag 关闭时,前端直接把 chat 类型的模型从列表过滤掉,
    // 保证 chatModels / imageModels / selectedChatModel 等下游 state 都不会
    // 拿到 chat 模型(即便模板里还有残留引用)。
    models.value = ENABLE_CHAT_MODEL
      ? m.items
      : m.items.filter((x) => x.type !== 'chat')
    const firstChat = m.items.find((x) => x.type === 'chat')
    if (firstChat) selectedChatModel.value = firstChat.slug
    selectedImageModel.value = pickPreferredImageModel(models.value, selectedImageModel.value)
  } catch {
    // 静默;错误拦截器已提示
  }
})

// ----------------------------------------------------
// Tabs
// ----------------------------------------------------
const activeTab = ref<'chat' | 'text2img' | 'img2img'>(
  ENABLE_CHAT_MODEL ? 'chat' : 'text2img',
)

// ====================================================
// 对话(Chat)
// ====================================================
interface UIMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  pending?: boolean
  error?: boolean
  at: number
}

let uid = 0

const systemPrompt = ref('你是一个友好、博学、回答精准的中文助手。回答中若涉及代码请使用 Markdown 代码块。')
const temperature = ref(0.7)
const chatInput = ref('')
const chatMsgs = ref<UIMessage[]>([])
const chatSending = ref(false)
const chatAbort = ref<AbortController | null>(null)
const chatScroll = ref<HTMLElement | null>(null)
const inputRef = ref<any>(null)

const suggestions = [
  { icon: '💡', title: '向我解释', sub: '量子纠缠到底是什么?' },
  { icon: '✍️', title: '帮我写作', sub: '一段 200 字的产品发布文案' },
  { icon: '🧑‍💻', title: '写段代码', sub: 'Go 实现令牌桶限流器' },
  { icon: '🌏', title: '中英互译', sub: '把上面这段翻译为英文' },
]

function useSuggestion(s: typeof suggestions[number]) {
  chatInput.value = `${s.title}:${s.sub}`
  nextTick(() => inputRef.value?.focus?.())
}

async function scrollChat(force = false) {
  await nextTick()
  const el = chatScroll.value
  if (!el) return
  if (force) {
    el.scrollTop = el.scrollHeight
    return
  }
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight
  if (gap < 180) el.scrollTop = el.scrollHeight
}

async function sendChat() {
  if (chatSending.value) return
  const text = chatInput.value.trim()
  if (!text) return
  if (!selectedChatModel.value) {
    ElMessage.warning('请选择一个文字模型')
    return
  }
  const now = Date.now()
  chatMsgs.value.push({ id: ++uid, role: 'user', content: text, at: now })
  chatInput.value = ''
  const assistant: UIMessage = { id: ++uid, role: 'assistant', content: '', pending: true, at: now }
  chatMsgs.value.push(assistant)
  await scrollChat(true)

  const history: PlayChatMessage[] = []
  if (systemPrompt.value.trim()) {
    history.push({ role: 'system', content: systemPrompt.value.trim() })
  }
  for (const m of chatMsgs.value.slice(0, -1)) {
    if (m.error) continue
    history.push({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })
  }

  chatSending.value = true
  chatAbort.value = new AbortController()
  try {
    await streamPlayChat(
      { model: selectedChatModel.value, messages: history, temperature: temperature.value },
      (delta) => {
        assistant.content += delta
        assistant.pending = false
        scrollChat()
      },
      chatAbort.value.signal,
    )
    assistant.pending = false
    if (!assistant.content) assistant.content = '(无输出)'
  } catch (err: unknown) {
    assistant.pending = false
    assistant.error = true
    const msg = err instanceof Error ? err.message : String(err)
    assistant.content = assistant.content || `请求失败:${msg}`
    ElMessage.error(msg)
  } finally {
    chatSending.value = false
    chatAbort.value = null
    scrollChat()
    userStore.fetchMe().catch(() => {})
  }
}

function stopChat() {
  chatAbort.value?.abort()
}

function resetChat() {
  if (chatSending.value) stopChat()
  chatMsgs.value = []
}

async function regenerate() {
  if (chatSending.value) return
  // 去掉最后一条 assistant,把最后一条 user 重发
  let lastUserIdx = -1
  for (let i = chatMsgs.value.length - 1; i >= 0; i--) {
    if (chatMsgs.value[i].role === 'user') { lastUserIdx = i; break }
  }
  if (lastUserIdx < 0) return
  const lastUserText = chatMsgs.value[lastUserIdx].content
  chatMsgs.value = chatMsgs.value.slice(0, lastUserIdx)
  chatInput.value = lastUserText
  await sendChat()
}

function copyText(s: string) {
  try {
    navigator.clipboard.writeText(s)
    ElMessage.success('已复制')
  } catch {
    ElMessage.warning('复制失败')
  }
}

onBeforeUnmount(() => chatAbort.value?.abort())

// ---------- 轻量 markdown 渲染(代码块 / 行内代码 / 粗体 / 链接) ----------
function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderMarkdown(raw: string): string {
  if (!raw) return ''
  const parts: string[] = []
  const blocks = raw.split(/```/g) // ``` 成对切分
  for (let i = 0; i < blocks.length; i++) {
    const chunk = blocks[i]
    if (i % 2 === 1) {
      // 代码块:首行可能是 lang
      const nl = chunk.indexOf('\n')
      let lang = ''
      let code = chunk
      if (nl >= 0) {
        const head = chunk.slice(0, nl).trim()
        if (/^[a-zA-Z0-9+_\-]{1,20}$/.test(head)) {
          lang = head
          code = chunk.slice(nl + 1)
        }
      }
      parts.push(
        `<pre class="mdk-pre" data-lang="${escapeHtml(lang || '')}"><code>${escapeHtml(
          code.replace(/\n$/, ''),
        )}</code></pre>`,
      )
    } else {
      // 行内元素
      let html = escapeHtml(chunk)
      // 行内代码 `xxx`
      html = html.replace(/`([^`\n]+)`/g, '<code class="mdk-ic">$1</code>')
      // 粗体 **xxx**
      html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      // 自动链接
      html = html.replace(
        /(https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+)/g,
        '<a href="$1" target="_blank" rel="noopener">$1</a>',
      )
      // 换行
      html = html.replace(/\n/g, '<br />')
      parts.push(html)
    }
  }
  return parts.join('')
}

// ====================================================
// 文生图(Text2Img)
// ====================================================

// 10 档比例。请求 size 根据比例与输出质量共同计算。
interface RatioOpt {
  l: string
  w: number
  h: number
}
const TEXT2IMG_RATIO_OPTIONS: readonly RatioOpt[] = [
  { l: '1:1', w: 36, h: 36 },
  { l: '5:4', w: 45, h: 36 },
  { l: '9:16', w: 27, h: 48 },
  { l: '16:9', w: 48, h: 27 },
  { l: '4:3', w: 44, h: 33 },
  { l: '3:2', w: 48, h: 32 },
  { l: '4:5', w: 29, h: 36 },
  { l: '3:4', w: 33, h: 44 },
  { l: '2:3', w: 32, h: 48 },
  { l: '21:9', w: 48, h: 21 },
] as const
const IMG2IMG_RATIO_OPTIONS: readonly RatioOpt[] = [
  { l: '1:1', w: 36, h: 36 },
  { l: '5:4', w: 45, h: 36 },
  { l: '9:16', w: 27, h: 48 },
  { l: '16:9', w: 48, h: 27 },
  { l: '4:3', w: 44, h: 33 },
  { l: '3:2', w: 48, h: 32 },
  { l: '4:5', w: 29, h: 36 },
  { l: '3:4', w: 33, h: 44 },
  { l: '2:3', w: 32, h: 48 },
  { l: '21:9', w: 48, h: 21 },
] as const
type OutputQualityValue = '1K' | '2K' | '4K'
const OUTPUT_QUALITY_OPTIONS: ReadonlyArray<{ value: OutputQualityValue; label: string }> = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
] as const

function resolveImageUnitPrice(model: SimpleModel | undefined, quality: OutputQualityValue): number {
  if (!model) return 0
  if (quality === '2K' && (model.image_price_per_call_2k ?? 0) > 0) {
    return model.image_price_per_call_2k ?? 0
  }
  if (quality === '4K' && (model.image_price_per_call_4k ?? 0) > 0) {
    return model.image_price_per_call_4k ?? 0
  }
  return model.image_price_per_call ?? 0
}

const OUTPUT_SIZE_BY_RATIO: Record<string, Record<OutputQualityValue, string>> = {
  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '4K': '2880x2880' },
  '5:4': { '1K': '1040x832', '2K': '2080x1664', '4K': '3200x2560' },
  '9:16': { '1K': '720x1280', '2K': '1152x2048', '4K': '2160x3840' },
  '16:9': { '1K': '1280x720', '2K': '2048x1152', '4K': '3840x2160' },
  '4:3': { '1K': '1024x768', '2K': '2048x1536', '4K': '3264x2448' },
  '3:2': { '1K': '1008x672', '2K': '2016x1344', '4K': '3504x2336' },
  '4:5': { '1K': '832x1040', '2K': '1664x2080', '4K': '2560x3200' },
  '3:4': { '1K': '768x1024', '2K': '1536x2048', '4K': '2448x3264' },
  '2:3': { '1K': '672x1008', '2K': '1344x2016', '4K': '2336x3504' },
  '21:9': { '1K': '1344x576', '2K': '2016x864', '4K': '3696x1584' },
}
const RATIO_LABELS: Record<string, string> = {
  '1:1': '方形',
  '5:4': '横屏',
  '9:16': '故事',
  '16:9': '宽屏',
  '4:3': '横屏',
  '3:2': '宽幅',
  '4:5': '标准',
  '3:4': '竖版',
  '2:3': '竖版',
  '21:9': '超宽屏',
}

function ratioLabel(ratio: string) {
  return RATIO_LABELS[ratio] || ratio
}

function resolveOutputSize(ratio: string, quality: OutputQualityValue): string {
  const ratioSizes = OUTPUT_SIZE_BY_RATIO[ratio] || OUTPUT_SIZE_BY_RATIO['1:1']
  return ratioSizes[quality]
}

// 预览小框的尺寸(按比例缩放后的 CSS px)。
function ratioBoxStyle(r: RatioOpt) {
  return { width: `${r.w}px`, height: `${r.h}px` }
}

// 比例选择仅更新状态,输入框保留原始文本。

const t2iPrompt = ref('')
const t2iRatio = ref<string>('1:1')
const t2iQuality = ref<OutputQualityValue>('1K')
const t2iN = ref(1)
const currentT2iPrice = computed(() => resolveImageUnitPrice(
  currentImageModel.value,
  supportsOutputSize.value ? t2iQuality.value : '1K',
))
const currentT2iTotalPrice = computed(() => currentT2iPrice.value * effectiveT2iN.value)
const t2iSending = ref(false)
const t2iResult = ref<PlayImageData[]>([])
const t2iError = ref('')
const t2iAbort = ref<AbortController | null>(null)

const imgExamples = [
  '赛博朋克城市夜景,霓虹雨夜,电影感光影,8k',
  '一只金色胖柴犬穿西装坐在办公桌前,油画质感',
  '极简几何海报,蓝橙配色,主体是一只展翅的鹤',
  '童话风格蘑菇屋,黄昏光线,柔和景深',
]

function useT2iExample(p: string) {
  t2iPrompt.value = p
}

async function sendText2Img() {
  const rawPrompt = t2iPrompt.value.trim()
  if (!rawPrompt) {
    ElMessage.warning('请输入描述词 prompt')
    return
  }
  const prompt = rawPrompt
  if (!selectedImageModel.value) {
    ElMessage.warning('请选择一个图片模型')
    return
  }
  t2iSending.value = true
  t2iError.value = ''
  t2iResult.value = []
  t2iAbort.value = new AbortController()
  try {
    const body = {
      model: selectedImageModel.value,
      prompt,
      n: effectiveT2iN.value,
      ...(supportsOutputSize.value ? { size: resolveOutputSize(t2iRatio.value, t2iQuality.value) } : {}),
    }
    const resp = await playGenerateImage(
      body,
      t2iAbort.value.signal,
    )
    t2iResult.value = resp.data || []
    if (t2iResult.value.length === 0) {
      t2iError.value = '未产出图片,请重试或更换描述'
    } else {
      ElMessage.success(`生成成功,共 ${t2iResult.value.length} 张`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    t2iError.value = msg
    ElMessage.error(msg)
  } finally {
    t2iSending.value = false
    t2iAbort.value = null
    userStore.fetchMe().catch(() => {})
  }
}

function stopText2Img() {
  t2iAbort.value?.abort()
}

// 预览 viewer
const previewVisible = ref(false)
const previewList = ref<string[]>([])
const previewIndex = ref(0)
function openPreview(urls: string[], idx: number) {
  previewList.value = urls
  previewIndex.value = idx
  previewVisible.value = true
}
function displayImageURL(img: PlayImageData) {
  return img.thumb_url || img.url
}
function resultPreviewURLs(items: PlayImageData[]) {
  return items.map(displayImageURL).filter(Boolean)
}
function downloadUrl(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener'
  a.download = ''
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ====================================================
// 图生图(Img2Img)
// ====================================================
interface RefImage {
  name: string
  dataUrl: string
  size: number
}
const refImages = ref<RefImage[]>([])
const i2iPrompt = ref('')
const i2iRatio = ref<string>('1:1')
const i2iQuality = ref<OutputQualityValue>('1K')
const currentI2iPrice = computed(() => resolveImageUnitPrice(
  currentImageModel.value,
  supportsOutputSize.value ? i2iQuality.value : '1K',
))
const currentI2iTotalPrice = computed(() => currentI2iPrice.value * effectiveI2iN.value)
const i2iSending = ref(false)
const i2iResult = ref<PlayImageData[]>([])
const i2iPreview = ref(false)
const i2iError = ref('')
const i2iAbort = ref<AbortController | null>(null)
const activeResultIndex = ref(0)
const activeResultImage = computed<PlayImageData | null>(() => i2iResult.value[activeResultIndex.value] || null)
const i2iResultUrls = computed(() => resultPreviewURLs(i2iResult.value))
// 与后端参考图限制保持一致：最多 4 张，单张最大 20MB。
const MAX_REF_COUNT = 4
const MAX_REF_BYTES = 20 * 1024 * 1024

function setActiveResult(idx: number) {
  if (idx < 0 || idx >= i2iResult.value.length) return
  activeResultIndex.value = idx
}

function handleFilePick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files) return
  for (const file of Array.from(files)) {
    if (refImages.value.length >= MAX_REF_COUNT) {
      ElMessage.warning('参考图最多 4 张')
      break
    }
    if (file.size > MAX_REF_BYTES) {
      ElMessage.warning(`${file.name} 超过 20MB 限制`)
      continue
    }
    const reader = new FileReader()
    reader.onload = () => {
      refImages.value.push({
        name: file.name,
        dataUrl: String(reader.result || ''),
        size: file.size,
      })
    }
    reader.readAsDataURL(file)
  }
  input.value = ''
}

function removeRefImage(idx: number) {
  refImages.value.splice(idx, 1)
}

async function imageUrlToDataUrl(url: string) {
  const resp = await fetch(url)
  const blob = await resp.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('结果图转换失败'))
    reader.readAsDataURL(blob)
  })
}

async function continueEditCurrentResult() {
  if (!activeResultImage.value) return
  try {
    const dataUrl = await imageUrlToDataUrl(displayImageURL(activeResultImage.value))
    refImages.value = [{
      name: `generated-${Date.now()}.png`,
      dataUrl,
      size: Math.round((dataUrl.length * 3) / 4),
    }]
    ElMessage.success('当前结果已写回参考图区')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    ElMessage.error(msg)
  }
}

async function sendImg2Img() {
  if (refImages.value.length === 0) {
    ElMessage.warning('请先上传至少一张参考图')
    return
  }
  const rawPrompt = i2iPrompt.value.trim()
  if (!rawPrompt) {
    ElMessage.warning('请描述希望的改动')
    return
  }
  const prompt = rawPrompt
  if (!selectedImageModel.value) {
    ElMessage.warning('请选择一个图片模型')
    return
  }
  i2iSending.value = true
  i2iError.value = ''
  i2iPreview.value = false
  i2iResult.value = []
  activeResultIndex.value = 0
  i2iAbort.value = new AbortController()
  try {
    const body = {
      model: selectedImageModel.value,
      prompt,
      n: 1,
      reference_images: refImages.value.map((r) => r.dataUrl),
      ...(supportsOutputSize.value ? { size: resolveOutputSize(i2iRatio.value, i2iQuality.value) } : {}),
    }
    const resp = await playGenerateImage(
      body,
      i2iAbort.value.signal,
    )
    i2iResult.value = resp.data || []
    i2iPreview.value = !!resp.is_preview
    activeResultIndex.value = 0
    if (i2iResult.value.length === 0) {
      i2iError.value = '未产出图片,请重试或调整描述'
    } else {
      if (i2iPreview.value) {
        ElMessage.warning('生成成功(预览模式):本次账号未命中 IMG2 灰度,展示的是 IMG1 预览图')
      }
      ElMessage.success(`生成成功,共 ${i2iResult.value.length} 张`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    i2iError.value = msg
    ElMessage.error(msg)
  } finally {
    i2iSending.value = false
    i2iAbort.value = null
  }
}

// 代码块内的 "复制" 按钮(通过事件委托,避免每次重渲染都重新绑定)
function onMsgClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null
  if (!t) return
  const btn = t.closest('.mdk-copy') as HTMLElement | null
  if (!btn) return
  const pre = btn.parentElement?.querySelector('code')
  if (!pre) return
  copyText(pre.textContent || '')
}

// input 自动聚焦(tab 切换后)
watch(activeTab, (v) => {
  if (v === 'chat') nextTick(() => inputRef.value?.focus?.())
})
</script>

<template>
  <div class="page-container playground">
    <!-- ============ Hero(紧凑条) ============ -->
    <div class="hero card-block">
      <div class="hero-left">
        <el-icon class="hero-ic"><MagicStick /></el-icon>
        <div class="hero-txt">
          <h2 class="hero-title">在线体验</h2>
          <span class="hero-sub">
            浏览器中直接调用 GPT {{ ENABLE_CHAT_MODEL ? '文字 / ' : '' }}图像模型 · 文生图 & 图生图 · 同一账号池、同一套计费,记录同步到「使用记录」
          </span>
        </div>
      </div>
      <div class="hero-stats">
        <div class="mini-stat">
          <span class="mini-num">{{ balance }}</span>
          <span class="mini-lbl">积分</span>
        </div>
        <template v-if="ENABLE_CHAT_MODEL">
          <span class="mini-dot" />
          <div class="mini-stat">
            <span class="mini-num">{{ chatModels.length }}</span>
            <span class="mini-lbl">文字模型</span>
          </div>
        </template>
        <span class="mini-dot" />
        <div class="mini-stat">
          <span class="mini-num">{{ imageModels.length }}</span>
          <span class="mini-lbl">图片模型</span>
        </div>
      </div>
    </div>

    <el-alert
      v-if="noticeText"
      class="play-notice"
      type="warning"
      :closable="false"
      show-icon
      :description="noticeText"
    />

    <!-- ============ Tabs ============ -->
    <el-tabs v-model="activeTab" class="pg-tabs">
      <!-- =================================================== -->
      <!--                          Chat                         -->
      <!-- =================================================== -->
      <el-tab-pane v-if="ENABLE_CHAT_MODEL" name="chat">
        <template #label>
          <span class="tab-lbl"><el-icon><ChatDotRound /></el-icon> 对话</span>
        </template>

        <div class="chat-grid">
          <!-- 左侧:模型 + System + 温度 -->
          <aside class="card-block side">
            <div class="side-row">
              <label class="side-lbl">文字模型</label>
              <el-select v-model="selectedChatModel" placeholder="选择文字模型" size="large" style="width:100%">
                <el-option v-for="m in chatModels" :key="m.id" :label="m.slug" :value="m.slug">
                  <div class="opt-row">
                    <span class="opt-slug">{{ m.slug }}</span>
                    <el-tag size="small" type="primary" effect="plain">chat</el-tag>
                  </div>
                </el-option>
              </el-select>
              <div v-if="currentChatDesc" class="side-hint">{{ currentChatDesc }}</div>
            </div>

            <div class="side-row">
              <label class="side-lbl">
                Temperature
                <span class="side-val">{{ temperature.toFixed(1) }}</span>
              </label>
              <el-slider v-model="temperature" :min="0" :max="2" :step="0.1" show-stops />
              <div class="side-hint">越低越保守、越高越发散。默认 0.7</div>
            </div>

            <div class="side-row">
              <label class="side-lbl">System Prompt</label>
              <el-input
                v-model="systemPrompt"
                type="textarea"
                :rows="6"
                resize="none"
                placeholder="为助手设定人格与风格"
              />
            </div>

            <el-button :disabled="chatMsgs.length === 0" @click="resetChat" class="side-btn">
              <el-icon><Delete /></el-icon> 清空会话
            </el-button>
          </aside>

          <!-- 右侧:聊天主区 -->
          <section class="card-block chat-main">
            <header class="chat-header">
              <div class="chat-title">
                <el-avatar :size="32" class="avatar-bot">
                  <el-icon><Cpu /></el-icon>
                </el-avatar>
                <div>
                  <div class="chat-model">{{ selectedChatModel || '未选择模型' }}</div>
                  <div class="chat-sub">
                    {{ chatSending ? '正在回复…' : (chatMsgs.length ? `${chatMsgs.length} 条消息` : '准备就绪') }}
                  </div>
                </div>
              </div>
              <div class="chat-tools">
                <el-tooltip content="重试上一个问题" placement="top">
                  <el-button
                    :disabled="chatSending || chatMsgs.length === 0"
                    circle
                    @click="regenerate"
                  >
                    <el-icon><RefreshRight /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
            </header>

            <div ref="chatScroll" class="chat-scroll" @click="onMsgClick">
              <!-- 空态:建议卡 -->
              <div v-if="chatMsgs.length === 0" class="welcome">
                <div class="welcome-hi">
                  👋 你好{{ user?.nickname ? ',' + user.nickname : '' }}
                </div>
                <div class="welcome-sub">选一个话题开始,或者直接在下方输入。</div>
                <div class="suggest-grid">
                  <div
                    v-for="(s, i) in suggestions"
                    :key="i"
                    class="suggest-card"
                    @click="useSuggestion(s)"
                  >
                    <div class="s-ic">{{ s.icon }}</div>
                    <div class="s-t">{{ s.title }}</div>
                    <div class="s-s">{{ s.sub }}</div>
                  </div>
                </div>
              </div>

              <!-- 消息列表 -->
              <article
                v-for="m in chatMsgs"
                :key="m.id"
                :class="['msg', m.role, m.error ? 'err' : '']"
              >
                <el-avatar :size="34" :class="m.role === 'user' ? 'avatar-user' : 'avatar-bot'">
                  <el-icon v-if="m.role === 'user'"><User /></el-icon>
                  <el-icon v-else><MagicStick /></el-icon>
                </el-avatar>
                <div class="msg-body">
                  <div class="msg-head">
                    <span class="who">{{ m.role === 'user' ? '我' : '助手' }}</span>
                    <span v-if="!m.pending && m.content" class="copy-btn" @click="copyText(m.content)">
                      <el-icon><CopyDocument /></el-icon> 复制
                    </span>
                  </div>
                  <div class="msg-content">
                    <div v-if="m.pending && !m.content" class="typing">
                      <span></span><span></span><span></span>
                    </div>
                    <div
                      v-else
                      class="md"
                      v-html="renderMarkdown(m.content)"
                    />
                  </div>
                </div>
              </article>
            </div>

            <!-- 输入条 -->
            <div class="composer" :class="{ focused: !!chatInput }">
              <el-input
                ref="inputRef"
                v-model="chatInput"
                type="textarea"
                :rows="1"
                :autosize="{ minRows: 1, maxRows: 6 }"
                resize="none"
                placeholder="给助手发消息…  Enter 发送,Shift+Enter 换行"
                @keydown.enter.exact.prevent="sendChat"
              />
              <div class="composer-tools">
                <span class="hint">
                  <el-icon><InfoFilled /></el-icon>
                  按 Enter 发送
                </span>
                <div style="flex:1" />
                <el-button v-if="chatSending" type="danger" @click="stopChat" round>
                  <el-icon><VideoPause /></el-icon> 停止
                </el-button>
                <el-button
                  v-else
                  type="primary"
                  :disabled="!chatInput.trim() || !selectedChatModel"
                  @click="sendChat"
                  round
                >
                  发送
                  <el-icon style="margin-left:4px"><Promotion /></el-icon>
                </el-button>
              </div>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <!-- =================================================== -->
      <!--                        文生图                         -->
      <!-- =================================================== -->
      <el-tab-pane name="text2img">
        <template #label>
          <span class="tab-lbl"><el-icon><Picture /></el-icon> 文生图</span>
        </template>

        <div class="img-grid">
          <aside class="card-block side">
            <div class="side-row">
              <label class="side-lbl">图片模型</label>
              <el-select v-model="selectedImageModel" placeholder="选择图片模型" size="large" style="width:100%">
                <el-option v-for="m in imageModels" :key="m.id" :label="m.slug" :value="m.slug">
                  <div class="opt-row">
                    <span class="opt-slug">{{ m.slug }}</span>
                    <el-tag size="small" type="warning" effect="plain">image</el-tag>
                  </div>
                </el-option>
              </el-select>
              <div v-if="currentImageDesc" class="side-hint">{{ currentImageDesc }}</div>
              <div class="price-hint">
                <span class="price-hint__title">
                  当前质量价格：{{ formatCredit(currentT2iPrice) }} 积分 / 张
                </span>
                <span v-if="supportsMultiImage" class="price-hint__sub">多张生成会按张数累计扣费</span>
                <span class="price-hint__sub">当前 {{ effectiveT2iN }} 张，预计消耗 {{ formatCredit(currentT2iTotalPrice) }} 积分</span>
              </div>
            </div>

            <div class="side-row">
              <label class="side-lbl">
                画面比例
                <span class="side-val">{{ t2iRatio }}</span>
              </label>
              <div class="ratio-row">
                <button
                  v-for="r in TEXT2IMG_RATIO_OPTIONS"
                  :key="r.l"
                  :class="['ratio-btn', { active: t2iRatio === r.l }]"
                  :title="`${ratioLabel(r.l)} · ${r.l}`"
                  @click="t2iRatio = r.l"
                >
                  <div class="ratio-box" :style="ratioBoxStyle(r)" />
                  <span class="ratio-name">{{ ratioLabel(r.l) }}</span>
                  <span class="ratio-val-sm">{{ r.l }}</span>
                </button>
              </div>
            </div>

            <div v-if="supportsMultiImage" class="side-row">
              <label class="side-lbl">张数 <span class="side-val">{{ t2iN }}</span></label>
              <el-slider v-model="t2iN" :min="1" :max="4" show-stops />
            </div>

            <div v-if="supportsOutputSize" class="side-row">
              <label class="side-lbl">输出质量 <span class="side-val">{{ t2iQuality }}</span></label>
              <el-radio-group v-model="t2iQuality" size="small" class="output-size-group">
                <el-radio-button
                  v-for="option in OUTPUT_QUALITY_OPTIONS"
                  :key="option.value"
                  :label="option.value"
                >
                  {{ option.label }}
                </el-radio-button>
              </el-radio-group>
            </div>

            <div class="side-row">
              <label class="side-lbl">Prompt</label>
              <el-input
                v-model="t2iPrompt"
                type="textarea"
                :rows="5"
                resize="none"
                placeholder="描述画面的主体、风格、光线、构图…越具体效果越好"
              />
              <div class="chips">
                <el-tag
                  v-for="(p, i) in imgExamples"
                  :key="i"
                  effect="plain"
                  round
                  class="chip"
                  @click="useT2iExample(p)"
                >{{ p }}</el-tag>
              </div>
            </div>

            <el-button v-if="t2iSending" type="danger" @click="stopText2Img" round class="side-btn">
              <el-icon><VideoPause /></el-icon> 停止
            </el-button>
            <el-button
              v-else
              type="primary"
              round
              size="large"
              :disabled="!t2iPrompt.trim() || !selectedImageModel"
              @click="sendText2Img"
              class="side-btn gen-btn"
            >
              <el-icon><MagicStick /></el-icon> 生成图片
            </el-button>
          </aside>

          <section class="card-block img-main">
            <div v-if="t2iSending" class="stage loading">
              <div class="orb"><el-icon class="spin"><Loading /></el-icon></div>
              <div class="stage-title">正在为你绘制…</div>
              <div class="stage-sub">上游渲染通常需要 1-2 分钟,请保持页面打开</div>
            </div>
            <div v-else-if="t2iError" class="err-block">
              <el-icon><WarningFilled /></el-icon>
              {{ t2iError }}
            </div>
            <div v-else-if="t2iResult.length === 0" class="stage">
              <div class="stage-art">🖼️</div>
              <div class="stage-title">还没有图片</div>
              <div class="stage-sub">在左侧填好 prompt 和参数,点击「生成图片」</div>
            </div>
            <div v-else class="result-wrap">
              <div class="result-grid">
                <div
                  v-for="(img, idx) in t2iResult"
                  :key="idx"
                  class="img-cell"
                  @click="openPreview(resultPreviewURLs(t2iResult), idx)"
                >
                  <img :src="displayImageURL(img)" :alt="`result-${idx}`" loading="lazy" />
                  <div class="img-actions" @click.stop>
                    <button class="iact" @click="openPreview(resultPreviewURLs(t2iResult), idx)">
                      <el-icon><ZoomIn /></el-icon>
                    </button>
                    <button class="iact" @click="downloadUrl(img.url)">
                      <el-icon><Download /></el-icon>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <!-- =================================================== -->
      <!--                        图生图                         -->
      <!-- =================================================== -->
      <el-tab-pane name="img2img">
        <template #label>
          <span class="tab-lbl"><el-icon><PictureFilled /></el-icon> 图生图</span>
        </template>

        <div class="img2img-compare">
          <section class="compare-panel compare-panel--reference">
            <div class="card-block compare-panel__card">
              <div class="compare-panel__head">
                <div>
                  <div class="compare-panel__title">参考图</div>
                  <div class="compare-panel__sub">参考图以方形卡片展示，点击卡片即可预览</div>
                </div>
                <span class="compare-panel__count">{{ refImages.length }} 张</span>
              </div>

              <div class="ref-card-grid">
                <template v-if="refImages.length">
                  <button
                    v-for="(r, idx) in refImages"
                    :key="`${r.name}-${idx}-${r.size}`"
                    type="button"
                    class="ref-card"
                    @click="openPreview(refImages.map((r) => r.dataUrl), idx)"
                  >
                    <img :src="r.dataUrl" :alt="r.name" class="ref-card__image" loading="lazy" />
                    <span class="ref-card__meta">
                      <span class="ref-card__name">{{ r.name }}</span>
                      <span class="ref-card__size">{{ (r.size / 1024).toFixed(0) }} KB</span>
                    </span>
                    <span class="ref-card__remove" @click.stop="removeRefImage(idx)">
                      <el-icon><Close /></el-icon>
                    </span>
                  </button>
                </template>

                <label :class="['ref-card', 'ref-card--adder', { 'ref-card--empty': !refImages.length }]">
                  <el-icon class="ref-card__adder-icon"><UploadFilled /></el-icon>
                  <div class="ref-card__adder-title">{{ refImages.length ? '添加图片' : '选择参考图' }}</div>
                  <div class="ref-card__adder-sub">{{ refImages.length ? '继续追加参考图' : '最多 4 张 · 单张 ≤ 20MB' }}</div>
                  <input type="file" accept="image/*" multiple @change="handleFilePick" />
                </label>
              </div>

              <div class="compare-panel__form">
                <div class="side-row">
                  <label class="side-lbl">图片模型</label>
                  <el-select v-model="selectedImageModel" placeholder="选择图片模型" size="large" style="width:100%">
                    <el-option v-for="m in imageModels" :key="m.id" :label="m.slug" :value="m.slug" />
                  </el-select>
                  <div v-if="currentImageDesc" class="side-hint">{{ currentImageDesc }}</div>
                  <div class="price-hint">
                    <span class="price-hint__title">
                      当前质量价格：{{ formatCredit(currentI2iPrice) }} 积分 / 张
                    </span>
                    <span v-if="supportsMultiImage" class="price-hint__sub">多张生成会按张数累计扣费</span>
                    <span class="price-hint__sub">当前 {{ effectiveI2iN }} 张，预计消耗 {{ formatCredit(currentI2iTotalPrice) }} 积分</span>
                  </div>
                </div>

                <div class="side-row">
                  <label class="side-lbl">
                    输出比例
                    <span class="side-val">{{ i2iRatio }}</span>
                  </label>
                  <div class="ratio-row">
                    <button
                      v-for="r in IMG2IMG_RATIO_OPTIONS"
                      :key="r.l"
                      type="button"
                      :class="['ratio-btn', { active: i2iRatio === r.l }]"
                      :title="`${ratioLabel(r.l)} · ${r.l}`"
                      @click="i2iRatio = r.l"
                    >
                      <div class="ratio-box" :style="ratioBoxStyle(r)" />
                      <span class="ratio-name">{{ ratioLabel(r.l) }}</span>
                      <span class="ratio-val-sm">{{ r.l }}</span>
                    </button>
                  </div>
                </div>

                <div v-if="supportsOutputSize" class="side-row">
                  <label class="side-lbl">输出质量 <span class="side-val">{{ i2iQuality }}</span></label>
                  <el-radio-group v-model="i2iQuality" size="small" class="output-size-group">
                    <el-radio-button
                      v-for="option in OUTPUT_QUALITY_OPTIONS"
                      :key="option.value"
                      :label="option.value"
                    >
                      {{ option.label }}
                    </el-radio-button>
                  </el-radio-group>
                </div>

                <div class="side-row">
                  <label class="side-lbl">希望如何改动</label>
                  <el-input
                    v-model="i2iPrompt"
                    type="textarea"
                    :rows="4"
                    resize="none"
                    placeholder="例:保持人物姿态,把背景换成赛博朋克夜景"
                  />
                </div>

                <el-button
                  type="primary"
                  round
                  size="large"
                  :loading="i2iSending"
                  :disabled="refImages.length === 0 || !i2iPrompt.trim() || !selectedImageModel"
                  @click="sendImg2Img"
                  class="side-btn gen-btn compare-generate-btn"
                >
                  <el-icon><MagicStick /></el-icon> 生成
                </el-button>
              </div>
            </div>
          </section>

          <section class="compare-panel compare-panel--result">
            <div class="card-block compare-panel__card">
              <div class="compare-panel__head">
                <div>
                  <div class="compare-panel__title">生成结果</div>
                  <div class="compare-panel__sub">右侧固定展示当前结果主图与主要操作，便于与参考图并排对照</div>
                </div>
                <span class="compare-panel__count">{{ i2iResult.length }} 张</span>
              </div>

              <el-alert
                v-if="i2iPreview && activeResultImage"
                class="preview-tip"
                type="warning"
                :closable="false"
                show-icon
                title="本次未使用 IMG2 灰度生成"
                description="上游没有把本账号放入 IMG2 终稿通道,返回的是 IMG1 预览图。"
              />

              <div class="compare-canvas compare-canvas--result">
                <div v-if="i2iError" class="err-block compare-canvas__status">
                  <el-icon><WarningFilled /></el-icon>
                  {{ i2iError }}
                </div>
                <div v-else-if="i2iSending" class="stage loading compare-canvas__status">
                  <div class="orb"><el-icon class="spin"><Loading /></el-icon></div>
                  <div class="stage-title">正在生成…</div>
                  <div class="stage-sub">结果会在当前画布中更新，页面保持开启即可</div>
                </div>
                <div v-else-if="!activeResultImage" class="stage compare-canvas__status">
                  <div class="stage-art">🎨</div>
                  <div class="stage-title">还没有结果</div>
                  <div class="stage-sub">先在左侧上传参考图并填写改动描述</div>
                </div>
                <template v-else>
                  <img
                    :src="displayImageURL(activeResultImage)"
                    :alt="`result-${activeResultIndex}`"
                    class="compare-image"
                    loading="lazy"
                  />
                </template>
              </div>

              <div v-if="i2iResult.length > 1" class="thumb-strip">
                <button
                  v-for="(img, idx) in i2iResult"
                  :key="`${img.url}-${idx}`"
                  type="button"
                  :class="['thumb-strip__item', 'thumb-strip__item--result', { active: idx === activeResultIndex }]"
                  @click="setActiveResult(idx)"
                >
                  <img :src="displayImageURL(img)" :alt="`result-${idx}`" class="thumb-strip__image" loading="lazy" />
                  <span class="thumb-strip__meta">第 {{ idx + 1 }} 张</span>
                </button>
              </div>

              <div v-if="activeResultImage" class="result-actions">
                <div class="result-primary-actions">
                  <a
                    class="result-action-btn result-action-btn--link"
                    :href="displayImageURL(activeResultImage)"
                    target="_blank"
                    rel="noopener"
                  >查看</a>
                  <button
                    type="button"
                    class="result-action-btn"
                    @click="openPreview(i2iResultUrls, activeResultIndex)"
                  >放大</button>
                  <button
                    type="button"
                    class="result-action-btn"
                    @click="downloadUrl(activeResultImage.url)"
                  >下载</button>
                </div>
                <button
                  type="button"
                  class="result-secondary-action"
                  @click="continueEditCurrentResult"
                >继续编辑当前结果</button>
              </div>
            </div>
          </section>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- ============ 图片预览(全屏 viewer) ============ -->
    <el-image-viewer
      v-if="previewVisible"
      :url-list="previewList"
      :initial-index="previewIndex"
      @close="previewVisible = false"
      teleported
    />
  </div>
</template>

<style scoped lang="scss">
.playground { padding-bottom: 24px; }
.preview-tip { margin-bottom: 14px; border-radius: 10px; }

/* ====================== Hero(紧凑条) ====================== */
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 18px !important;
  margin-bottom: 14px !important;
}
.hero-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.hero-ic {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  flex-shrink: 0;
}
.hero-txt {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}
.hero-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}
.hero-sub {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.hero-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.play-notice {
  margin-bottom: 16px;
}
.mini-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  .mini-num {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-color-primary);
  }
  .mini-lbl {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
.mini-dot {
  width: 3px; height: 3px; border-radius: 50%;
  background: var(--el-border-color);
}

/* ====================== Tabs ====================== */
.pg-tabs {
  :deep(.el-tabs__header) { margin-bottom: 16px; }
  :deep(.el-tabs__nav-wrap::after) { background: var(--el-border-color-lighter); }
  :deep(.el-tabs__item) {
    font-size: 14px;
    font-weight: 500;
    padding: 0 18px;
  }
  :deep(.el-tabs__item.is-active) { font-weight: 600; }
}
.tab-lbl { display: inline-flex; align-items: center; gap: 6px; }

/* ====================== Side ====================== */
.side { display: flex; flex-direction: column; gap: 16px; height: fit-content; position: sticky; top: 12px; }
.side-row { display: flex; flex-direction: column; gap: 6px; }
.side-lbl {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
  display: flex; justify-content: space-between; align-items: center;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.side-val { font-weight: 600; color: var(--el-color-primary); letter-spacing: 0; text-transform: none; font-size: 13px; }
.side-hint { font-size: 12px; color: var(--el-text-color-placeholder); line-height: 1.5; }
.price-hint {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.price-hint__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.5;
}
.price-hint__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.side-btn { margin-top: 4px; }
.gen-btn { box-shadow: 0 6px 18px -6px rgba(64, 158, 255, 0.55); }
.opt-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }

/* ---- 输出质量单选组 ---- */
.output-size-group { display: flex; width: 100%; }
.output-size-group :deep(.el-radio-button) { flex: 1; }
.output-size-group :deep(.el-radio-button__inner) {
  width: 100%;
  padding-left: 0;
  padding-right: 0;
  letter-spacing: 0.2px;
}
.opt-slug { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; }

/* ====================== Chat ====================== */
.chat-grid {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  min-height: 620px;
}
.chat-main {
  display: flex; flex-direction: column;
  padding: 0;
  overflow: hidden;
  height: 720px;
}
.chat-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(180deg, var(--el-bg-color) 0%, var(--el-fill-color-lighter) 100%);
}
.chat-title { display: flex; align-items: center; gap: 10px; }
.chat-model { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.chat-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.chat-tools { display: flex; gap: 6px; }

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 22px 24px;
  scroll-behavior: smooth;
}

/* ----- 欢迎 ----- */
.welcome {
  min-height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 30px 20px;
}
.welcome-hi {
  font-size: 24px; font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}
.welcome-sub { color: var(--el-text-color-secondary); margin-bottom: 22px; font-size: 14px; }
.suggest-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  width: 100%; max-width: 680px;
}
.suggest-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  background: var(--el-bg-color);
  transition: all 0.2s;
  .s-ic { font-size: 20px; margin-bottom: 4px; }
  .s-t { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
  .s-s { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; line-height: 1.5; }
  &:hover {
    border-color: var(--el-color-primary);
    transform: translateY(-1px);
    box-shadow: 0 6px 18px -8px rgba(64, 158, 255, 0.35);
  }
}

/* ----- 消息 ----- */
.msg {
  display: flex;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  animation: fadeIn 0.25s ease;
  &:last-child { border-bottom: none; }
  &.err .msg-content { color: var(--el-color-danger); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.avatar-user {
  background: var(--el-color-primary);
  color: #fff;
  flex-shrink: 0;
}
.avatar-bot {
  background: var(--el-color-success);
  color: #fff;
  flex-shrink: 0;
}
.msg-body { flex: 1; min-width: 0; }
.msg-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 4px;
  .who { font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); }
  .copy-btn {
    font-size: 12px; color: var(--el-text-color-placeholder); cursor: pointer;
    display: inline-flex; align-items: center; gap: 2px;
    opacity: 0; transition: opacity 0.2s;
    &:hover { color: var(--el-color-primary); }
  }
}
.msg:hover .copy-btn { opacity: 1; }
.msg-content {
  font-size: 14px; line-height: 1.75;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

/* markdown 渲染产物 */
.md :deep(.mdk-pre) {
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px 14px;
  border-radius: 10px;
  overflow-x: auto;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  margin: 8px 0;
  position: relative;
  &::before {
    content: attr(data-lang);
    position: absolute;
    top: 6px; right: 10px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94a3b8;
    opacity: 0.8;
  }
}
.md :deep(.mdk-ic) {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px;
}
.md :deep(a) { color: var(--el-color-primary); text-decoration: none; }
.md :deep(a:hover) { text-decoration: underline; }
.md :deep(strong) { font-weight: 600; }

/* typing 指示器 */
.typing {
  display: inline-flex; gap: 5px; padding: 4px 0;
  span {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--el-color-primary);
    animation: blink 1.4s infinite ease-in-out both;
  }
  span:nth-child(2) { animation-delay: 0.2s; }
  span:nth-child(3) { animation-delay: 0.4s; }
}
@keyframes blink {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.7); }
  40% { opacity: 1; transform: scale(1); }
}

/* ----- 输入条 ----- */
.composer {
  padding: 12px 18px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  transition: box-shadow 0.2s;
  :deep(.el-textarea__inner) {
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 14px;
    box-shadow: none;
    border: 1px solid var(--el-border-color);
    transition: border-color 0.2s, box-shadow 0.2s;
    &:focus {
      border-color: var(--el-color-primary);
      box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.15);
    }
  }
}
.composer-tools {
  display: flex; align-items: center; gap: 8px; margin-top: 10px;
  .hint {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--el-text-color-placeholder);
  }
}

/* ====================== 图片面板 ====================== */
.img-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 16px;
}
.img-main { min-height: 560px; }
.img2img-compare {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.compare-panel {
  min-height: 100%;
  min-width: 0;
}
.compare-panel__card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  min-width: 0;
}
.compare-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.compare-panel__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.compare-panel__sub {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.compare-panel__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
}
.compare-panel__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 4px;
}
.compare-canvas {
  position: relative;
  min-height: 420px;
  height: min(62vh, 560px);
  max-width: 100%;
  border-radius: 16px;
  border: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(180deg, var(--el-fill-color-light) 0%, var(--el-bg-color) 100%);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.compare-canvas--result {
  background: linear-gradient(180deg, rgba(103, 194, 58, 0.06) 0%, var(--el-bg-color) 100%);
}
.compare-canvas__status {
  width: calc(100% - 24px);
  margin: 12px;
}
.compare-image {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  background: rgba(255, 255, 255, 0.55);
}

/* 比例按钮 —— 10 档预设,5 列 × 2 行 grid */
.ratio-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.ratio-btn {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 6px 2px 5px;
  cursor: pointer;
  display: flex; flex-direction: column; align-items: center;
  gap: 3px;
  font-size: 11px; color: var(--el-text-color-secondary);
  transition: all 0.15s;
  min-width: 0;
  .ratio-box {
    background: var(--el-fill-color-light);
    border-radius: 2px;
    border: 1px solid var(--el-border-color-lighter);
    flex: 0 0 auto;
    /* 固定一个 36px 高度的占位,避免不同比例下按钮整体高度抖动 */
    margin: 2px 0;
  }
  .ratio-name {
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 0;
  }
  .ratio-val-sm {
    font-size: 10px;
    color: var(--el-text-color-placeholder);
    font-family: ui-monospace, Menlo, Consolas, monospace;
    line-height: 1.2;
  }
  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    .ratio-val-sm { color: var(--el-color-primary); }
  }
  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-weight: 600;
    .ratio-box {
      background: var(--el-color-primary);
      border-color: var(--el-color-primary);
    }
    .ratio-val-sm { color: var(--el-color-primary); font-weight: 600; }
  }
}

/* ratio 说明文字里的内联代码样式 */
.hint-code {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11.5px;
}

/* prompt chips */
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chip { cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.chip:hover { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }

/* 参考图区卡片 */
.ref-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 12px;
}
.ref-card {
  position: relative;
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  padding: 0;
  cursor: zoom-in;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.ref-card:hover {
  transform: translateY(-1px);
  border-color: var(--el-color-primary);
  box-shadow: 0 8px 20px rgba(64, 158, 255, 0.14);
}
.ref-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ref-card__meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.76));
  color: #fff;
  text-align: left;
}
.ref-card__name {
  font-size: 11px;
  line-height: 1.35;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ref-card__size {
  font-size: 10px;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.84);
}
.ref-card__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.58);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}
.ref-card__remove:hover {
  background: rgba(245, 108, 108, 0.92);
}
.ref-card--adder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  border-style: dashed;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  text-align: center;
  cursor: pointer;
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}
.ref-card--adder:hover {
  background: var(--el-color-primary-light-9);
}
.ref-card__adder-icon {
  font-size: 24px;
  color: var(--el-color-primary);
}
.ref-card__adder-title {
  font-size: 13px;
  line-height: 1.3;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.ref-card__adder-sub {
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
.ref-card--empty {
  min-height: 132px;
}

.thumb-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.thumb-strip__item {
  position: relative;
  flex: 0 0 88px;
  height: 88px;
  border-radius: 14px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  overflow: hidden;
}
.thumb-strip__item {
  padding: 0;
  cursor: pointer;
  transition: all 0.2s;
}
.thumb-strip__item:hover,
.thumb-strip__item.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.12);
}
.thumb-strip__item--result.active {
  border-color: var(--el-color-success);
  box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.12);
}
.thumb-strip__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-strip__meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 4px 6px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.72));
  color: #fff;
  font-size: 11px;
  line-height: 1.3;
}
.thumb-strip__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.58);
  color: #fff;
  cursor: pointer;
}

/* 主区 stage / 结果 */
.stage {
  min-height: 480px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; color: var(--el-text-color-secondary); padding: 40px 24px;
  .stage-art { font-size: 64px; margin-bottom: 16px; opacity: 0.7; }
  .stage-title { font-size: 16px; font-weight: 600; color: var(--el-text-color-primary); }
  .stage-sub { font-size: 13px; margin-top: 6px; }
  &.loading { gap: 14px; }
  .orb {
    width: 72px; height: 72px; border-radius: 50%;
    background: var(--el-color-primary-light-8);
    display: flex; align-items: center; justify-content: center;
    animation: pulseOrb 1.8s ease-in-out infinite;
  }
}
@keyframes pulseOrb {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 var(--el-color-primary-light-5); }
  50%      { transform: scale(1.08); box-shadow: 0 0 0 14px rgba(64,158,255,0); }
}
.spin { font-size: 30px; animation: spin 1s linear infinite; color: var(--el-color-primary); }
@keyframes spin { to { transform: rotate(360deg); } }

.err-block {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  padding: 12px 14px;
  border-radius: 10px;
  display: flex; align-items: center; gap: 8px;
  white-space: pre-wrap; word-break: break-word;
  border: 1px solid var(--el-color-danger-light-5);
}

.result-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  padding: 4px;
}
.img-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  cursor: zoom-in;
  background: var(--el-fill-color-light);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.2s;
  img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    transition: transform 0.4s;
  }
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
    img { transform: scale(1.03); }
    .img-actions { opacity: 1; }
  }
}
.img-actions {
  position: absolute; top: 8px; right: 8px;
  display: flex; gap: 6px;
  opacity: 0; transition: opacity 0.2s;
  .iact {
    width: 30px; height: 30px; border-radius: 50%;
    background: rgba(0,0,0,0.55); color: #fff;
    border: none; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px;
    &:hover { background: var(--el-color-primary); }
  }
}

.result-wrap {
  display: flex; flex-direction: column; gap: 10px;
  padding: 4px;
  .result-grid { padding: 0; }
}
.result-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.result-primary-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.result-action-btn {
  min-width: 88px;
  height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.result-action-btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.result-action-btn--link {
  background: var(--el-color-primary-light-9);
  border-color: rgba(64, 158, 255, 0.28);
}
.result-secondary-action {
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}
.result-secondary-action:hover {
  color: var(--el-color-primary);
}

/* ====================== Dark mode ====================== */
:global(html.dark) .md :deep(.mdk-pre) {
  background: #0b1020;
  color: #cbd5e1;
}

/* ====================== Responsive ====================== */
@media (max-width: 1100px) {
  .chat-grid, .img-grid, .img2img-compare { grid-template-columns: 1fr; }
  .side { position: static; }
  .chat-main { height: 580px; }
}
@media (max-width: 720px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .hero-sub { display: none; }
  .hero-stats { width: 100%; justify-content: flex-start; }
  .ref-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .ref-card__adder-title {
    font-size: 12px;
  }
  .ref-card__adder-sub {
    font-size: 10px;
  }
  .compare-canvas {
    min-height: 300px;
    height: min(52vh, 420px);
  }
  .compare-image {
    max-height: 100%;
  }
  .result-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .result-primary-actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .result-action-btn { min-width: 0; width: 100%; }
}
</style>
