<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import AuthFormCard from '@/components/auth/AuthFormCard.vue'
import AuthHeroPanel from '@/components/auth/AuthHeroPanel.vue'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useSiteStore } from '@/stores/site'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const store = useUserStore()
const site = useSiteStore()

const siteName = computed(() => site.get('site.name', 'GPT2API'))
const siteDesc = computed(() =>
  site.get('site.description', '面向开发者与小规模业务的 GPT-image 中转 API 平台'),
)
const siteLogo = computed(() => site.get('site.logo_url', ''))
const siteFooter = computed(() => site.get('site.footer', ''))
const allowRegister = computed(() => site.allowRegister())

const formRef = ref<FormInstance>()
const loading = ref(false)
const submitError = ref('')

const form = reactive({
  email: '',
  password: '',
})

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '至少 6 位', trigger: 'blur' },
  ],
}

async function onSubmit() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return
  submitError.value = ''
  loading.value = true
  try {
    await store.login(form.email, form.password)
    ElMessage.success('登录成功')
    const redirect = (route.query.redirect as string) || '/personal/dashboard'
    router.replace(redirect)
  } catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : '登录失败，请稍后重试'
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
      title="登录控制台"
      subtitle="欢迎回来，管理 API 密钥、查看图像任务、调用记录与账户额度"
    >
      <div class="auth-card-head">
        <router-link to="/" class="auth-back">返回首页</router-link>
        <p class="auth-tip">首次使用可先注册账号并领取体验额度</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        size="large"
        label-position="top"
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

        <el-form-item label="登录密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="current-password"
            @keyup.enter="onSubmit"
          />
        </el-form-item>

        <el-button type="primary" :loading="loading" class="auth-submit" @click="onSubmit">
          确认登录
        </el-button>
      </el-form>

      <template #footer>
        <div class="auth-foot">
          <p v-if="allowRegister">还没有账户时，可先注册后进入控制台。</p>
          <p v-else>当前采用邀请开通方式，可联系管理员创建账号。</p>
          <router-link v-if="allowRegister" to="/register">立即注册</router-link>
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
}
</style>
