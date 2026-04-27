<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { sendRegisterEmailCode } from '@/api/auth'
import { ApiError } from '@/api/http'
import AuthFormCard from '@/components/auth/AuthFormCard.vue'
import AuthHeroPanel from '@/components/auth/AuthHeroPanel.vue'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useSiteStore } from '@/stores/site'
import { useUserStore } from '@/stores/user'

const registerEmailCodeStorageKey = 'gpt2api.register.email_code'

const router = useRouter()
const store = useUserStore()
const site = useSiteStore()

const siteName = computed(() => site.get('site.name', 'GPT2API'))
const siteDesc = computed(() =>
  site.get('site.description', '面向开发者与小规模业务的 GPT-image 中转 API 平台'),
)
const siteLogo = computed(() => site.get('site.logo_url', ''))
const siteFooter = computed(() => site.get('site.footer', ''))
const allowRegister = computed(() => site.allowRegister())
const requireEmailVerify = computed(() => site.requireEmailVerify())
const noticeTitle = computed(() =>
  allowRegister.value ? '新账号赠送体验额度' : '当前采用邀请开通方式',
)
const noticeDesc = computed(() =>
  allowRegister.value
    ? '注册后即可进入控制台创建 API 密钥并开始图像生成调用'
    : '可联系管理员创建账号后登录控制台使用',
)
const noticeTone = computed(() => (allowRegister.value ? 'success' : 'warning'))
const emailCodeButtonText = computed(() => {
  if (countdownSec.value > 0) return `${countdownSec.value}s 后重发`
  if (sendingEmailCode.value) return '发送中…'
  return '发送验证码'
})
const emailCodeButtonDisabled = computed(() =>
  !allowRegister.value || !requireEmailVerify.value || sendingEmailCode.value || countdownSec.value > 0,
)

const formRef = ref<FormInstance>()
const loading = ref(false)
const sendingEmailCode = ref(false)
const countdownSec = ref(0)
const submitError = ref('')
const form = reactive({
  email: '',
  password: '',
  confirm: '',
  nickname: '',
  email_code: '',
})

let countdownTimer: number | null = null
let restoringEmailCodeState = false

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 64, message: '6~64 位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== form.password) callback(new Error('两次密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
  email_code: [
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!requireEmailVerify.value) {
          callback()
          return
        }
        if (!String(value || '').trim()) {
          callback(new Error('请输入邮箱验证码'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function readRetryAfterSec(err: unknown) {
  if (!(err instanceof ApiError)) return 0
  const payload = err.data as { retry_after_sec?: number } | undefined
  return Number(payload?.retry_after_sec || 0)
}

function persistEmailCodeCountdown(expireAt: number) {
  if (expireAt <= Date.now()) {
    sessionStorage.removeItem(registerEmailCodeStorageKey)
    return
  }
  sessionStorage.setItem(
    registerEmailCodeStorageKey,
    JSON.stringify({
      email: normalizeEmail(form.email),
      expire_at: expireAt,
    }),
  )
}

function stopCountdown() {
  if (countdownTimer != null) {
    window.clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function syncCountdown(expireAt: number) {
  const next = Math.max(0, Math.ceil((expireAt - Date.now()) / 1000))
  countdownSec.value = next
  if (next > 0) {
    persistEmailCodeCountdown(expireAt)
    return
  }
  stopCountdown()
  sessionStorage.removeItem(registerEmailCodeStorageKey)
}

function startCountdown(expireAt: number) {
  stopCountdown()
  syncCountdown(expireAt)
  if (countdownSec.value <= 0) return
  countdownTimer = window.setInterval(() => syncCountdown(expireAt), 1000)
}

function resetEmailCodeState() {
  stopCountdown()
  countdownSec.value = 0
  form.email_code = ''
  sessionStorage.removeItem(registerEmailCodeStorageKey)
  formRef.value?.clearValidate?.(['email_code'])
}

function restoreEmailCodeState() {
  const raw = sessionStorage.getItem(registerEmailCodeStorageKey)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as { email?: string; expire_at?: number }
    const email = normalizeEmail(String(parsed.email || ''))
    const expireAt = Number(parsed.expire_at || 0)
    if (!email || expireAt <= Date.now()) {
      sessionStorage.removeItem(registerEmailCodeStorageKey)
      return
    }
    restoringEmailCodeState = true
    if (!normalizeEmail(form.email)) {
      form.email = email
    }
    restoringEmailCodeState = false
    if (normalizeEmail(form.email) !== email) {
      sessionStorage.removeItem(registerEmailCodeStorageKey)
      return
    }
    startCountdown(expireAt)
  } catch {
    sessionStorage.removeItem(registerEmailCodeStorageKey)
  } finally {
    restoringEmailCodeState = false
  }
}

async function sendEmailCode() {
  if (emailCodeButtonDisabled.value || !formRef.value) return
  const valid = await formRef.value.validateField('email').then(() => true).catch(() => false)
  if (!valid) return
  submitError.value = ''
  sendingEmailCode.value = true
  try {
    const result = await sendRegisterEmailCode({ email: form.email })
    const retryAfterSec = Number(result.retry_after_sec || 0)
    if (retryAfterSec > 0) {
      startCountdown(Date.now() + retryAfterSec * 1000)
    }
    ElMessage.success('验证码已发送，请查收邮箱')
  } catch (err: unknown) {
    const retryAfterSec = readRetryAfterSec(err)
    if (retryAfterSec > 0) {
      startCountdown(Date.now() + retryAfterSec * 1000)
    }
  } finally {
    sendingEmailCode.value = false
  }
}

async function onSubmit() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return
  submitError.value = ''
  loading.value = true
  try {
    await store.register(form.email, form.password, form.nickname, form.email_code)
    resetEmailCodeState()
    ElMessage.success('注册成功，正在登录…')
    await store.login(form.email, form.password)
    router.replace('/personal/dashboard')
  } catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : '注册失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

watch(() => form.email, (value, oldValue) => {
  if (restoringEmailCodeState) return
  if (normalizeEmail(value) === normalizeEmail(oldValue || '')) return
  resetEmailCodeState()
})

watch(requireEmailVerify, (enabled) => {
  if (enabled) return
  resetEmailCodeState()
})

onMounted(() => {
  restoreEmailCodeState()
})

onBeforeUnmount(() => {
  stopCountdown()
})
</script>

<template>
  <AuthShell :site-footer="siteFooter">
    <template #hero>
      <AuthHeroPanel
        :site-name="siteName"
        :site-desc="siteDesc"
        :site-logo="siteLogo"
        :allow-register="allowRegister"
      />
    </template>

    <AuthFormCard
      title="注册账号"
      subtitle="领取体验额度，开始接入 GPT-image API"
      :notice-title="noticeTitle"
      :notice-desc="noticeDesc"
      :notice-tone="noticeTone"
    >
      <div class="auth-card-head">
        <router-link to="/" class="auth-back">返回首页</router-link>
        <p class="auth-tip">注册账号 → 进入控制台 → 创建 API 密钥</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        :disabled="!allowRegister"
        class="auth-form"
        @submit.prevent="onSubmit"
      >
        <el-alert
          v-if="submitError"
          type="error"
          :closable="false"
          :title="submitError"
          class="auth-form__alert"
        />

        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" autocomplete="username" />
        </el-form-item>

        <el-form-item v-if="requireEmailVerify" label="邮箱验证码" prop="email_code">
          <div class="auth-email-code">
            <el-input
              v-model="form.email_code"
              maxlength="6"
              autocomplete="one-time-code"
              inputmode="numeric"
              @keyup.enter="onSubmit"
            />
            <el-button
              class="auth-email-code__button"
              plain
              :loading="sendingEmailCode"
              :disabled="emailCodeButtonDisabled"
              @click="sendEmailCode"
            >
              {{ emailCodeButtonText }}
            </el-button>
          </div>
          <p class="auth-email-code__hint">验证码 10 分钟内有效，发送成功后 60 秒内可再次发送。</p>
        </el-form-item>

        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="选填" />
        </el-form-item>

        <el-form-item label="登录密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>

        <el-form-item label="确认密码" prop="confirm">
          <el-input
            v-model="form.confirm"
            type="password"
            show-password
            autocomplete="new-password"
            @keyup.enter="onSubmit"
          />
        </el-form-item>

        <el-button
          type="primary"
          class="auth-submit"
          :loading="loading"
          :disabled="!allowRegister"
          @click="onSubmit"
        >
          注册并进入控制台
        </el-button>
      </el-form>

      <template #footer>
        <div class="auth-foot">
          <p v-if="allowRegister">已有账户时，可返回登录页进入控制台。</p>
          <p v-else>当前采用邀请开通方式，可联系管理员创建账号。</p>
          <router-link to="/login">已有账户，返回登录</router-link>
        </div>
      </template>
    </AuthFormCard>
  </AuthShell>
</template>

<style scoped lang="scss">
.auth-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.auth-back {
  display: inline-flex;
  align-items: center;
  color: #93c5fd;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}

.auth-tip {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  text-align: right;
  color: #94a3b8;
}

.auth-form__alert {
  margin-bottom: 16px;
}

.auth-email-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px;
  gap: 12px;
  width: 100%;
}

.auth-email-code__button {
  min-height: 48px;
  border-radius: 16px;
}

.auth-email-code__hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: #94a3b8;
}

.auth-submit {
  width: 100%;
  margin-top: 6px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  box-shadow: 0 20px 44px rgba(37, 99, 235, 0.2);
}

.auth-foot {
  text-align: center;

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.8;
    color: #94a3b8;
  }

  a {
    display: inline-flex;
    margin-top: 10px;
    color: #60a5fa;
    text-decoration: none;
    font-size: 13px;
    font-weight: 700;
  }
}

:deep(.el-form-item__label) {
  color: rgba(248, 250, 252, 0.86);
}

:deep(.el-input__wrapper) {
  min-height: 48px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.6);
}

@media (max-width: 640px) {
  .auth-card-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .auth-tip {
    text-align: left;
  }

  .auth-email-code {
    grid-template-columns: 1fr;
  }
}
</style>
