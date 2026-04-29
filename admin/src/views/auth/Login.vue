<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { FormInstance } from 'element-plus';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import AuthFormCard from '@/components/auth/AuthFormCard.vue';
import AuthShell from '@/components/auth/AuthShell.vue';
import { useSiteStore } from '@/stores/site';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const route = useRoute();
const store = useUserStore();
const site = useSiteStore();

const siteName = computed(() => site.get('site.name', 'OAI Hub'));
const siteFooter = computed(() => site.get('site.footer', ''));

const formRef = ref<FormInstance>();
const loading = ref(false);
const submitError = ref('');

const form = reactive({
    email: '',
    password: '',
});

const rules = {
    email: [
        { required: true, message: '请输入邮箱', trigger: 'blur' },
        { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
    ],
    password: [
        { required: true, message: '请输入密码', trigger: 'blur' },
        { min: 6, message: '至少 6 位', trigger: 'blur' },
    ],
};

async function onSubmit() {
    if (!formRef.value) return;
    const ok = await formRef.value.validate().catch(() => false);
    if (!ok) return;
    submitError.value = '';
    loading.value = true;
    try {
        await store.login(form.email, form.password);
        await store.assertAdminAccess();
        ElMessage.success('登录成功');
        const redirect = (route.query.redirect as string) || '/admin/dashboard';
        router.replace(redirect);
    } catch (err: unknown) {
        submitError.value = err instanceof Error ? err.message : '登录失败，请稍后重试';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <AuthShell :site-footer="siteFooter">
        <AuthFormCard title="后台登录" subtitle="请输入管理员账号和密码">
            <div class="auth-login-head">
                <div class="auth-login-head__mark">{{ (siteName[0] || 'G').toUpperCase() }}</div>
                <div class="auth-login-head__copy">
                    <p class="auth-login-head__badge">管理后台</p>
                    <h3>{{ siteName }}</h3>
                    <p class="auth-login-head__desc">仅限管理员账号访问，用于处理用户、订单、额度与系统配置。</p>
                </div>
            </div>

            <el-form
                ref="formRef"
                :model="form"
                :rules="rules"
                size="large"
                label-position="top"
                class="auth-form"
                @submit.prevent="onSubmit">
                <el-alert
                    v-if="submitError"
                    type="error"
                    :closable="false"
                    :title="submitError"
                    class="auth-form__alert" />

                <el-form-item label="邮箱" prop="email">
                    <el-input v-model="form.email" autocomplete="username" />
                </el-form-item>

                <el-form-item label="登录密码" prop="password">
                    <el-input
                        v-model="form.password"
                        type="password"
                        show-password
                        autocomplete="current-password"
                        @keyup.enter="onSubmit" />
                </el-form-item>

                <el-button type="primary" :loading="loading" class="auth-submit" @click="onSubmit">
                    确认登录
                </el-button>
            </el-form>

            <template #footer>
                <div class="auth-foot">
                    <p>登录成功后进入后台首页。</p>
                    <p>普通账号完成认证后会返回登录页。</p>
                </div>
            </template>
        </AuthFormCard>
    </AuthShell>
</template>

<style scoped lang="scss">
.auth-login-head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 20px;
}

.auth-login-head__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex: 0 0 48px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.22), rgba(59, 130, 246, 0.48));
    color: #eff6ff;
    font-size: 20px;
    font-weight: 700;
    box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.18);
}

.auth-login-head__copy {
    min-width: 0;
}

.auth-login-head__badge {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.6;
    letter-spacing: 0.08em;
    color: #93c5fd;
}

.auth-login-head__copy h3 {
    margin: 6px 0 0;
    font-size: 22px;
    line-height: 1.2;
    color: #f8fafc;
}

.auth-login-head__desc {
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 1.7;
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
    .auth-login-head {
        align-items: flex-start;
    }

    .auth-login-head__copy h3 {
        font-size: 20px;
    }
}
</style>
