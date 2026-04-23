<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useSiteStore } from '@/stores/site'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const store = useUserStore()
const site = useSiteStore()

const siteName = computed(() => site.get('site.name', 'GPT2API'))
const allowRegister = computed(() => site.allowRegister())

const formRef = ref<FormInstance>()
const loading = ref(false)
const submitError = ref('')
const form = reactive({
  email: '',
  password: '',
  confirm: '',
  nickname: '',
})

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
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        if (v !== form.password) cb(new Error('两次密码不一致'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

async function onSubmit() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return
  submitError.value = ''
  loading.value = true
  try {
    await store.register(form.email, form.password, form.nickname)
    ElMessage.success('注册成功，正在登录…')
    await store.login(form.email, form.password)
    router.replace('/personal/dashboard')
  } catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : '注册失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <router-link to="/" class="auth-back">返回首页</router-link>

      <div class="auth-copy">
        <p class="auth-copy__eyebrow">{{ siteName }}</p>
        <h1>加入 NexusAI</h1>
        <p>创建账户后即可进入控制台，配置密钥并开始图像生成调用。</p>
      </div>

      <div class="auth-steps">
        <span>注册账号</span>
        <span>进入控制台</span>
        <span>创建 API 密钥</span>
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
          <el-input v-model="form.email" placeholder="name@company.com" autocomplete="username" />
        </el-form-item>

        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="选填，用于区分项目或账户" />
        </el-form-item>

        <el-form-item label="访问密码" prop="password">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
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
          立即创建账户
        </el-button>
      </el-form>

      <div class="auth-foot">
        <p v-if="allowRegister">创建完成后会自动登录并进入控制台。</p>
        <p v-else>当前采用邀请开通方式，可联系管理员创建账号。</p>
        <router-link to="/login">已有账户，返回登录</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.auth-page {
  width: min(560px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 56px 0 88px;
}

.auth-card {
  position: relative;
  overflow: hidden;
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 32px;
  background: rgba(13, 13, 13, 0.92);
  box-shadow: 0 36px 80px rgba(2, 6, 23, 0.48);

  &::after {
    content: '';
    position: absolute;
    top: -40px;
    right: -20px;
    width: 220px;
    height: 220px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(168, 85, 247, 0.2), transparent 68%);
    pointer-events: none;
  }
}

.auth-back {
  display: inline-flex;
  color: rgba(226, 232, 240, 0.68);
  text-decoration: none;
  font-size: 14px;
}

.auth-copy {
  position: relative;
  z-index: 1;
  margin-top: 24px;

  h1 {
    margin: 8px 0 0;
    font-size: 40px;
    line-height: 1.08;
    font-style: italic;
    letter-spacing: -0.04em;
  }

  p:last-child {
    margin: 12px 0 0;
    font-size: 14px;
    line-height: 1.8;
    color: rgba(226, 232, 240, 0.62);
  }
}

.auth-copy__eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #60a5fa;
}

.auth-steps {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 24px;

  span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.04);
    font-size: 12px;
    color: rgba(226, 232, 240, 0.74);
  }
}

.auth-form {
  position: relative;
  z-index: 1;
  margin-top: 24px;
}

.auth-form__alert {
  margin-bottom: 16px;
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
  position: relative;
  z-index: 1;
  margin-top: 20px;
  text-align: center;

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.8;
    color: rgba(226, 232, 240, 0.6);
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
  .auth-page {
    width: min(560px, calc(100vw - 24px));
    padding: 40px 0 72px;
  }

  .auth-card {
    padding: 22px 18px;
  }

  .auth-steps {
    grid-template-columns: 1fr;
  }
}
</style>
