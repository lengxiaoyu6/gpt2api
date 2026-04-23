<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Refresh,
  Check,
  Setting,
  Lock,
  User,
  Connection,
  Wallet,
  Message as MailIcon,
  Picture,
} from '@element-plus/icons-vue'
import {
  listSettings,
  updateSettings,
  reloadSettings,
  sendTestEmail,
  type SettingItem,
} from '@/api/settings'
import { useSiteStore } from '@/stores/site'

const loading = ref(false)
const saving = ref(false)
const items = ref<SettingItem[]>([])
// 本地编辑态,key -> value(string)
const draft = reactive<Record<string, string>>({})

type SanyueImgHubDraft = {
  uploadUrl: string
  authCode: string
  serverCompress: boolean
  returnFormat: string
  uploadChannel: 'telegram' | 'huggingface'
}

const defaultSanyueImgHubDraft: SanyueImgHubDraft = {
  uploadUrl: 'https://img2.oaiapis.com/upload',
  authCode: '',
  serverCompress: false,
  returnFormat: 'full',
  uploadChannel: 'telegram',
}

const sanyueCloudConfigKey = 'storage.cloud_config'

const tabs = [
  { name: 'site', label: '通用设置', icon: Setting },
  { name: 'auth', label: '安全与认证', icon: Lock },
  { name: 'defaults', label: '用户默认值', icon: User },
  { name: 'gateway', label: '网关服务', icon: Connection },
  { name: 'billing', label: '计费与充值', icon: Wallet },
  { name: 'mail', label: '邮件设置', icon: MailIcon },
  { name: 'storage', label: '存储设置', icon: Picture },
] as const
const activeTab = ref<(typeof tabs)[number]['name']>('site')

const grouped = computed(() => {
  const map: Record<string, SettingItem[]> = {
    site: [], auth: [], defaults: [], gateway: [], billing: [], mail: [], storage: [],
  }
  for (const it of items.value) {
    // 旧 category "limit" 归并到 defaults 显示
    const cat = it.category === 'limit' ? 'defaults' : it.category
    ;(map[cat] ||= []).push(it)
  }
  for (const k of Object.keys(map)) map[k].sort((a, b) => a.key.localeCompare(b.key))
  return map
})

const dirtyCount = computed(() => {
  let n = 0
  for (const it of items.value) {
    if (String(draft[it.key] ?? '') !== String(it.value)) n++
  }
  return n
})

async function load() {
  loading.value = true
  try {
    const d = await listSettings()
    items.value = d.items
    for (const it of d.items) draft[it.key] = it.value
  } finally {
    loading.value = false
  }
}

function reset() {
  for (const it of items.value) draft[it.key] = it.value
  ElMessage.info('已重置为服务端当前值')
}

function isBool(it: SettingItem) { return it.type === 'bool' }
function isInt(it: SettingItem) { return it.type === 'int' }
function isFloat(it: SettingItem) { return it.type === 'float' }
function isSelect(it: SettingItem) { return it.type === 'select' }
function isSanyueImgHub(it: SettingItem) { return it.type === 'sanyue_img_hub' && it.key === sanyueCloudConfigKey }
function isTextarea(it: SettingItem) { return it.key === 'site.image_notice' || it.key === 'site.showcase_urls' }
function inputType(it: SettingItem) {
  if (it.type === 'email') return 'email'
  if (it.type === 'url') return 'url'
  return 'text'
}

function parseSanyueImgHubDraft(raw: string): SanyueImgHubDraft {
  const next = { ...defaultSanyueImgHubDraft }
  if (!raw) return next
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.upload_url === 'string') next.uploadUrl = parsed.upload_url
    if (typeof parsed?.auth_code === 'string') next.authCode = parsed.auth_code
    if (typeof parsed?.server_compress === 'boolean') next.serverCompress = parsed.server_compress
    if (typeof parsed?.return_format === 'string') next.returnFormat = parsed.return_format
    if (parsed?.upload_channel === 'huggingface') next.uploadChannel = 'huggingface'
    if (parsed?.upload_channel === 'telegram') next.uploadChannel = 'telegram'
  } catch {
    return next
  }
  return next
}

function stringifySanyueImgHubDraft(value: SanyueImgHubDraft): string {
  return JSON.stringify({
    upload_url: value.uploadUrl.trim(),
    auth_code: value.authCode,
    server_compress: Boolean(value.serverCompress),
    return_format: value.returnFormat.trim(),
    upload_channel: value.uploadChannel,
  })
}

function updateSanyueImgHubField(key: string, patch: Partial<SanyueImgHubDraft>) {
  const current = parseSanyueImgHubDraft(draft[key] ?? '')
  draft[key] = stringifySanyueImgHubDraft({ ...current, ...patch })
}

async function save() {
  const diff: Record<string, string> = {}
  for (const it of items.value) {
    const v = draft[it.key] ?? ''
    if (String(v) !== String(it.value)) diff[it.key] = String(v)
  }
  if (Object.keys(diff).length === 0) {
    ElMessage.info('没有需要保存的修改')
    return
  }
  saving.value = true
  try {
    await updateSettings(diff)
    ElMessage.success(`已保存 ${Object.keys(diff).length} 项`)
    await load()
    useSiteStore().refresh()
  } finally {
    saving.value = false
  }
}

async function doReload() {
  await ElMessageBox.confirm('从数据库强制重载最新值到内存缓存?', '确认', {
    type: 'warning',
  }).catch(() => 'cancel')
  try {
    await reloadSettings()
    ElMessage.success('已重载')
    await load()
  } catch { /* 拦截器已处理 */ }
}

// ---- 邮件测试 ----
const mailDlg = ref(false)
const mailTo = ref('')
const mailSending = ref(false)
async function submitTestMail() {
  if (!mailTo.value) {
    ElMessage.warning('请输入收件邮箱')
    return
  }
  mailSending.value = true
  try {
    await sendTestEmail(mailTo.value)
    ElMessage.success('测试邮件已发出')
    mailDlg.value = false
  } catch { /* 拦截器已处理 */ } finally {
    mailSending.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-container">
    <div class="card-block" v-loading="loading">
      <!-- 顶部:标题 + 操作栏(始终可见) -->
      <div class="flex-between settings-head">
        <div>
          <div class="page-title" style="margin:0">系统设置</div>
          <div class="settings-subtitle">
            所有修改在点击"保存修改"后立即生效,无需重启服务
          </div>
        </div>
        <div class="flex-wrap-gap">
          <el-button :icon="Refresh" @click="doReload">强制重载</el-button>
          <el-button :icon="MailIcon" @click="mailDlg = true">发测试邮件</el-button>
          <el-button :disabled="dirtyCount === 0" @click="reset">重置</el-button>
          <el-button
            type="primary"
            :icon="Check"
            :loading="saving"
            @click="save"
          >
            保存修改<span v-if="dirtyCount > 0"> ({{ dirtyCount }})</span>
          </el-button>
        </div>
      </div>

      <el-tabs v-model="activeTab" class="settings-tabs">
        <el-tab-pane v-for="t in tabs" :key="t.name" :name="t.name">
          <template #label>
            <span class="tab-label">
              <el-icon><component :is="t.icon" /></el-icon>
              <span>{{ t.label }}</span>
            </span>
          </template>

          <div class="tab-body">
            <el-empty
              v-if="!grouped[t.name] || grouped[t.name].length === 0"
              description="暂无可配置项"
            />
            <el-form
              v-else
              label-width="170px"
              label-position="right"
              class="setting-form"
            >
              <el-form-item
                v-for="it in grouped[t.name]"
                :key="it.key"
                :label="it.label || it.key"
              >
                <div class="field-wrap">
                  <template v-if="isSanyueImgHub(it)">
                    <div class="sanyue-grid">
                      <el-input
                        :model-value="parseSanyueImgHubDraft(draft[it.key]).uploadUrl"
                        placeholder="https://img2.oaiapis.com/upload"
                        clearable
                        @update:model-value="(v) => updateSanyueImgHubField(it.key, { uploadUrl: String(v ?? '') })"
                      />
                      <el-input
                        :model-value="parseSanyueImgHubDraft(draft[it.key]).authCode"
                        placeholder="请输入 authCode"
                        type="password"
                        show-password
                        clearable
                        @update:model-value="(v) => updateSanyueImgHubField(it.key, { authCode: String(v ?? '') })"
                      />
                      <el-switch
                        :model-value="parseSanyueImgHubDraft(draft[it.key]).serverCompress"
                        @update:model-value="(v) => updateSanyueImgHubField(it.key, { serverCompress: Boolean(v) })"
                      />
                      <el-input
                        :model-value="parseSanyueImgHubDraft(draft[it.key]).returnFormat"
                        placeholder="full"
                        clearable
                        @update:model-value="(v) => updateSanyueImgHubField(it.key, { returnFormat: String(v ?? '') })"
                      />
                      <el-select
                        :model-value="parseSanyueImgHubDraft(draft[it.key]).uploadChannel"
                        style="width: 100%"
                        @update:model-value="(v) => updateSanyueImgHubField(it.key, { uploadChannel: v === 'huggingface' ? 'huggingface' : 'telegram' })"
                      >
                        <el-option label="telegram" value="telegram" />
                        <el-option label="huggingface" value="huggingface" />
                      </el-select>
                    </div>
                    <div class="hint">上传地址</div>
                    <div class="hint">鉴权码，仅在云存储模式下生效</div>
                    <div class="hint">serverCompress</div>
                    <div class="hint">returnFormat</div>
                    <div class="hint">uploadChannel</div>
                  </template>
                  <el-switch
                    v-else-if="isBool(it)"
                    :model-value="draft[it.key] === 'true'"
                    @update:model-value="(v) => (draft[it.key] = v ? 'true' : 'false')"
                  />
                  <el-input-number
                    v-else-if="isInt(it)"
                    :model-value="Number(draft[it.key] || 0)"
                    :min="0"
                    :controls-position="'right'"
                    style="width: 240px"
                    @update:model-value="(v) => (draft[it.key] = String(v ?? 0))"
                  />
                  <el-input-number
                    v-else-if="isFloat(it)"
                    :model-value="Number(draft[it.key] || 0)"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    :precision="2"
                    :controls-position="'right'"
                    style="width: 240px"
                    @update:model-value="(v) => (draft[it.key] = String(v ?? 0))"
                  />
                  <el-select v-else-if="isSelect(it)" v-model="draft[it.key]" style="width: 240px">
                    <el-option
                      v-for="opt in it.options || []"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                      :disabled="opt.disabled"
                    />
                  </el-select>
                  <el-input
                    v-else
                    v-model="draft[it.key]"
                    :placeholder="it.desc || it.label"
                    :type="isTextarea(it) ? 'textarea' : inputType(it)"
                    :rows="isTextarea(it) ? 3 : undefined"
                    clearable
                    style="max-width: 520px"
                  />
                  <div v-if="it.desc" class="hint">{{ it.desc }}</div>
                </div>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 测试邮件 -->
    <el-dialog v-model="mailDlg" title="发送 SMTP 测试邮件" width="420px">
      <el-form label-width="80px">
        <el-form-item label="收件人">
          <el-input v-model="mailTo" placeholder="your@mail.com" type="email" clearable />
        </el-form-item>
        <div style="font-size:12px;color:var(--el-text-color-secondary)">
          使用 <code>configs/config.yaml</code> 的 SMTP 配置发送;未配置时会直接失败。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="mailDlg = false">取消</el-button>
        <el-button type="primary" :loading="mailSending" @click="submitTestMail">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.settings-head {
  margin-bottom: 4px;
}
.settings-subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.settings-tabs {
  margin-top: 8px;
}
.settings-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-body {
  padding-top: 4px;
}
.setting-form .el-form-item {
  margin-bottom: 18px;
}
.field-wrap {
  width: 100%;
}
.sanyue-grid {
  display: grid;
  gap: 10px;
  max-width: 520px;
}
.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

@media (max-width: 640px) {
  .setting-form :deep(.el-form-item__label) {
    width: auto !important;
    padding-right: 8px !important;
    line-height: 1.5;
  }
}
</style>
