<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSiteStore } from '@/stores/site';
import { useUserStore } from '@/stores/user';
import { brandParts } from '@/utils/brand';

const route = useRoute();
const site = useSiteStore();
const user = useUserStore();
const brand = brandParts();

const siteName = computed(() => site.get('site.name', 'GPT2API'));
const siteDesc = computed(() => site.get('site.description', '稳定的 GPT-image 中转 API 平台'));
const siteLogo = computed(() => site.get('site.logo_url', ''));
const siteFooter = computed(() => site.get('site.footer', ''));
const allowRegister = computed(() => site.allowRegister());
const dashboardHref = computed(() => (user.isLoggedIn ? '/personal/dashboard' : '/login?redirect=/personal/dashboard'));

const navItems = [
    { label: '首页', href: '/' },
    { label: '定价方案', href: '/pricing' },
];

function isActive(href: string) {
    return route.path === href;
}
</script>

<template>
    <div class="public-layout">
        <div class="public-layout__glow public-layout__glow--blue" />
        <div class="public-layout__glow public-layout__glow--violet" />

        <header class="public-header">
            <div class="public-header__inner">
                <router-link to="/" class="public-brand">
                    <img v-if="siteLogo" :src="siteLogo" class="public-brand__logo" alt="logo" />
                    <div v-else class="public-brand__mark">{{ (siteName[0] || 'G').toUpperCase() }}</div>
                    <div class="public-brand__copy">
                        <strong>{{ siteName }}</strong>
                        <span>{{ siteDesc }}</span>
                    </div>
                </router-link>

                <nav class="public-nav">
                    <router-link
                        v-for="item in navItems"
                        :key="item.href"
                        :to="item.href"
                        class="public-nav__link"
                        :class="{ 'is-active': isActive(item.href) }">
                        {{ item.label }}
                    </router-link>
                </nav>

                <div class="public-actions">
                    <router-link v-if="!user.isLoggedIn" to="/login" class="public-action public-action--ghost">
                        登录
                    </router-link>
                    <router-link
                        v-if="!user.isLoggedIn && allowRegister"
                        to="/register"
                        class="public-action public-action--primary">
                        注册
                    </router-link>
                    <router-link
                        v-if="user.isLoggedIn"
                        :to="dashboardHref"
                        class="public-action public-action--primary">
                        控制台
                    </router-link>
                </div>
            </div>
        </header>

        <main class="public-main">
            <router-view />
        </main>

        <footer class="public-footer">
            <div class="public-footer__inner">
                <div class="public-footer__brand">
                    <span>{{ siteName }}</span>
                    <small>当前项目基于 {{ brand.brand }} 二次开发</small>
                </div>
                <div class="public-footer__links">
                    <router-link to="/pricing">定价方案</router-link>
                </div>
            </div>
            <p v-if="siteFooter" class="public-footer__note">{{ siteFooter }}</p>
        </footer>
    </div>
</template>

<style scoped lang="scss">
.public-layout {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    color: #f8fafc;
    background:
        radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 28%),
        radial-gradient(circle at top right, rgba(168, 85, 247, 0.14), transparent 24%),
        linear-gradient(180deg, #040507 0%, #090b11 42%, #070810 100%);
    overflow: hidden;
}

.public-layout__glow {
    position: absolute;
    border-radius: 999px;
    filter: blur(120px);
    pointer-events: none;
}

.public-layout__glow--blue {
    top: -80px;
    left: -60px;
    width: 280px;
    height: 280px;
    background: rgba(37, 99, 235, 0.18);
}

.public-layout__glow--violet {
    right: -100px;
    top: 120px;
    width: 320px;
    height: 320px;
    background: rgba(139, 92, 246, 0.14);
}

.public-header {
    position: sticky;
    top: 0;
    z-index: 20;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(4, 6, 11, 0.75);
    backdrop-filter: blur(18px);
}

.public-header__inner,
.public-footer__inner {
    width: min(1200px, calc(100vw - 32px));
    margin: 0 auto;
}

.public-header__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 72px;
}

.public-brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    color: inherit;
    text-decoration: none;
}

.public-brand__logo,
.public-brand__mark {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    border-radius: 14px;
}

.public-brand__logo {
    object-fit: contain;
    background: rgba(255, 255, 255, 0.96);
}

.public-brand__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #2563eb, #7c3aed 68%, #22d3ee);
    font-size: 18px;
    font-weight: 700;
    box-shadow: 0 18px 44px rgba(37, 99, 235, 0.28);
}

.public-brand__copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    strong {
        font-size: 16px;
        line-height: 1.2;
    }

    span {
        max-width: 320px;
        font-size: 12px;
        line-height: 1.5;
        color: rgba(226, 232, 240, 0.72);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

.public-nav,
.public-actions,
.public-footer__links {
    display: flex;
    align-items: center;
    gap: 12px;
}

.public-nav__link,
.public-footer__links a {
    color: rgba(226, 232, 240, 0.72);
    text-decoration: none;
    transition:
        color 0.2s ease,
        border-color 0.2s ease,
        background 0.2s ease;
}

.public-nav__link {
    padding: 10px 14px;
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
}

.public-nav__link:hover,
.public-nav__link.is-active,
.public-footer__links a:hover {
    color: #ffffff;
}

.public-nav__link.is-active {
    border-color: rgba(96, 165, 250, 0.24);
    background: rgba(255, 255, 255, 0.04);
}

.public-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 18px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #ffffff;
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    transition:
        transform 0.2s ease,
        background 0.2s ease,
        border-color 0.2s ease;
}

.public-action:hover {
    transform: translateY(-1px);
}

.public-action--ghost {
    background: rgba(255, 255, 255, 0.03);
}

.public-action--ghost:hover {
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
}

.public-action--primary {
    border-color: rgba(96, 165, 250, 0.32);
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    box-shadow: 0 18px 44px rgba(59, 130, 246, 0.22);
}

.public-main {
    position: relative;
    z-index: 1;
    flex: 1;
}

.public-footer {
    position: relative;
    z-index: 1;
    padding: 28px 0 40px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(2, 4, 8, 0.72);
}

.public-footer__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
}

.public-footer__brand {
    display: flex;
    flex-direction: column;
    gap: 6px;

    span {
        font-size: 15px;
        font-weight: 700;
    }

    small {
        font-size: 12px;
        line-height: 1.6;
        color: rgba(226, 232, 240, 0.62);
    }
}

.public-footer__links {
    flex-wrap: wrap;
    justify-content: flex-end;

    a {
        font-size: 13px;
    }
}

.public-footer__note {
    width: min(1200px, calc(100vw - 32px));
    margin: 12px auto 0;
    font-size: 12px;
    line-height: 1.7;
    color: rgba(226, 232, 240, 0.58);
}

@media (max-width: 960px) {
    .public-header__inner {
        flex-wrap: wrap;
        padding: 14px 0;
    }

    .public-nav {
        order: 3;
        width: 100%;
        overflow-x: auto;
        padding-bottom: 2px;
    }

    .public-footer__inner {
        flex-direction: column;
        align-items: flex-start;
    }

    .public-footer__links {
        justify-content: flex-start;
    }
}

@media (max-width: 640px) {
    .public-header__inner,
    .public-footer__inner,
    .public-footer__note {
        width: min(1200px, calc(100vw - 24px));
    }

    .public-brand__copy span,
    .public-nav {
        display: none;
    }

    .public-actions {
        gap: 8px;
    }

    .public-action {
        min-height: 38px;
        padding: 0 14px;
    }
}
</style>
