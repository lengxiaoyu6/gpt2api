<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import AuthFormCard from '@/components/auth/AuthFormCard.vue'
import AuthHeroPanel from '@/components/auth/AuthHeroPanel.vue'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useSiteStore } from '@/stores/site'
import { useUserStore } from '@/stores/user'

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

const noticeTitle = computed(() => (allowRegister.value ? '新账号赠送体验额度' : '当前采用邀请开通方式'))
const noticeDesc = computed(() =>
  allowRegister.value
    ? '注册后即可进入控制台创建 API 密钥并开始图像生成调用'
    : '可联系管理员创建账号后登录控制台使用',
)

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
      title="注册并进入控制台"
      subtitle="创建账号后即可管理 API 密钥、查看额度并发起图像生成调用"
      :notice-title="noticeTitle"
      :notice-desc="noticeDesc"
      :notice-tone="allowRegister ? 'success' : 'warning'"
    >
      <div class="register-steps">
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
        @submit.prevent="onSubmit"
      >
        <el-alert
          v-if="submitError"
          type="error"
          :closable="false"
          :title="submitError"
          class="auth-inline-alert"
        />

        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="you@example.com" autocomplete="username" />
        </el-form-item>

        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="选填，用于区分项目或账户" />
        </el-form-item>

        <el-form-item label="密码" prop="password">
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
          class="submit-button"
          :loading="loading"
          :disabled="!allowRegister"
          @click="onSubmit"
        >
          注册并进入控制台
        </el-button>
      </el-form>

      <template #footer>
        <div class="auth-actions">
          <p class="auth-tip">已有账号可直接登录控制台查看任务与调用记录</p>
          <router-link to="/login" class="auth-link">返回登录</router-link>
        </div>
      </template>
    </AuthFormCard>
  </AuthShell>
</template>

<style scoped lang="scss">
.register-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 20px;

  span {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 10px;
    border: 1px solid rgba(59, 130, 246, 0.22);
    border-radius: 14px;
    font-size: 12px;
    line-height: 1.5;
    color: #cbd5e1;
    background: rgba(15, 23, 42, 0.44);
  }
}

.auth-inline-alert {
  margin-bottom: 16px;
}

.submit-button {
  width: 100%;
  margin-top: 4px;
}

.auth-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.auth-tip {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #cbd5e1;
}

.auth-link {
  color: #60a5fa;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.auth-link:hover {
  color: #93c5fd;
}

@media (max-width: 640px) {
  .register-steps {
    grid-template-columns: 1fr;
  }
}
</style>
