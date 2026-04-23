<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { changeMyPassword } from '@/api/me'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const store = useUserStore()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

const rules: FormRules<typeof form> = {
  old_password: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码至少 6 位', trigger: 'blur' },
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.new_password) {
          callback(new Error('两次输入的新密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

async function onSubmit() {
  if (!formRef.value) return
  await formRef.value.validate()
  submitting.value = true
  try {
    await changeMyPassword({ old_password: form.old_password, new_password: form.new_password })
    ElMessage.success('密码修改成功，请重新登录')
    await store.logout()
    router.replace('/login')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-container security-page">
    <div class="card-block security-hero">
      <div>
        <h2 class="page-title security-page__title">安全中心</h2>
        <p class="security-page__desc">修改账号登录密码后，当前登录态会立即清理。</p>
      </div>
    </div>

    <div class="card-block security-panel">
      <div class="flex-between security-panel__header">
        <div>
          <div class="security-panel__title">
            <el-icon><Lock /></el-icon>
            <span>修改密码</span>
          </div>
          <p class="security-panel__desc">完成原密码校验后设置新的账号登录密码。</p>
        </div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="security-form">
        <el-form-item label="原密码" prop="old_password">
          <el-input v-model="form.old_password" type="password" show-password placeholder="请输入原密码" />
        </el-form-item>

        <el-form-item label="新密码" prop="new_password">
          <el-input v-model="form.new_password" type="password" show-password placeholder="请输入新密码" />
        </el-form-item>

        <el-form-item label="确认新密码" prop="confirm_password">
          <el-input v-model="form.confirm_password" type="password" show-password placeholder="请再次输入新密码" />
        </el-form-item>

        <div class="form-actions">
          <el-button type="primary" :loading="submitting" @click="onSubmit">确认修改</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<style scoped lang="scss">
.security-page {
  display: flex;
  flex-direction: column;
}

.security-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  flex-wrap: wrap;
}

.security-page__title {
  margin: 0;
}

.security-page__desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.security-panel__header {
  margin-bottom: 20px;
}

.security-panel__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.security-panel__desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.security-form {
  max-width: 560px;
}

.form-actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 8px;
}
</style>
