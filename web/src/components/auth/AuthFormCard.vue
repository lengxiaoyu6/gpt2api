<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    subtitle: string
    noticeTitle?: string
    noticeDesc?: string
    noticeTone?: 'success' | 'warning'
  }>(),
  {
    noticeTitle: '',
    noticeDesc: '',
    noticeTone: 'success',
  },
)
</script>

<template>
  <el-card class="auth-form-card" shadow="never">
    <div v-if="noticeTitle" class="auth-form-card__notice" :class="`is-${noticeTone}`">
      <p class="auth-form-card__notice-title">{{ noticeTitle }}</p>
      <p v-if="noticeDesc" class="auth-form-card__notice-desc">{{ noticeDesc }}</p>
    </div>

    <div class="auth-form-card__title">{{ title }}</div>
    <div class="auth-form-card__subtitle">{{ subtitle }}</div>

    <div class="auth-form-card__body">
      <slot />
    </div>

    <div v-if="$slots.footer" class="auth-form-card__footer">
      <slot name="footer" />
    </div>
  </el-card>
</template>

<style scoped lang="scss">
.auth-form-card {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.78));
  box-shadow: 0 32px 80px rgba(2, 6, 23, 0.36);

  :deep(.el-card__body) {
    padding: 24px;
  }
}

.auth-form-card__notice {
  margin-bottom: 20px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid transparent;

  &.is-success {
    background: rgba(34, 197, 94, 0.08);
    border-color: rgba(34, 197, 94, 0.22);
  }

  &.is-warning {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.24);
  }
}

.auth-form-card__notice-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.auth-form-card__notice-desc {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: #cbd5e1;
}

.auth-form-card__title {
  font-size: 26px;
  line-height: 1.15;
  font-weight: 700;
  color: #f8fafc;
}

.auth-form-card__subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: #94a3b8;
}

.auth-form-card__body {
  margin-top: 22px;
}

.auth-form-card__footer {
  margin-top: 18px;
}

@media (max-width: 640px) {
  .auth-form-card {
    :deep(.el-card__body) {
      padding: 20px;
    }
  }

  .auth-form-card__title {
    font-size: 22px;
  }
}
</style>
