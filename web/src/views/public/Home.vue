<script setup lang="ts">
import { computed } from 'vue';
import { useSiteStore } from '@/stores/site';
import { useUserStore } from '@/stores/user';

const site = useSiteStore();
const user = useUserStore();

const siteName = computed(() => site.get('site.name', 'GPT2API'));
const siteDesc = computed(() =>
    site.get('site.description', '稳定的 GPT-Image 中转 API，一站式集成，低延迟支撑大规模并发绘图请求。'),
);
const primaryHref = computed(() => (user.isLoggedIn ? '/personal/dashboard' : '/register'));
const primaryLabel = computed(() => (user.isLoggedIn ? '进入控制台' : '立即开始集成'));

const stats = [
    { value: '99.9%', label: '服务可用性' },
    { value: '1M+', label: '每日请求' },
];

const features = [
    { icon: 'Lightning', title: '极速下发', desc: '智能路由策略确保毫秒级调度，批量任务保持稳定响应。' },
    { icon: 'Lock', title: '安全可靠', desc: '多节点转发与访问隔离机制，适合长期稳定承载创作请求。' },
    { icon: 'Connection', title: '简单易用', desc: '兼容标准接口结构，脚本、服务端与工作台均可快速接入。' },
];

const previews = [
    'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800&auto=format&fit=crop',
];
</script>

<template>
    <div class="home-page">
        <section class="hero-section">
            <div class="hero-section__copy">
                <div class="hero-badge">不仅仅仅限于AI生图</div>
                <h1>
                    释放您的
                    <span>AI 想象力</span>
                </h1>
                <p>{{ siteDesc }}</p>

                <div class="hero-actions">
                    <router-link :to="primaryHref" class="hero-action hero-action--primary">{{
                        primaryLabel
                    }}</router-link>
                </div>

                <div class="hero-stats">
                    <article v-for="item in stats" :key="item.label">
                        <strong>{{ item.value }}</strong>
                        <span>{{ item.label }}</span>
                    </article>
                </div>
            </div>

            <div class="hero-terminal">
                <div class="hero-terminal__head">
                    <div class="hero-terminal__dots">
                        <span />
                        <span />
                        <span />
                    </div>
                    <small>{{ siteName }} · request.sh</small>
                </div>
                <div class="hero-terminal__body">
                    <p><span>curl</span> http://localhost:5173/v1/images/generations \</p>
                    <p>-H "Authorization: Bearer ${YOUR_API_KEY}" \</p>
                    <p>-d '{'</p>
                    <p>"model": "gpt-image-2",</p>
                    <p>"prompt": "cyberpunk cat in neon city"</p>
                    <p>}'</p>
                </div>
            </div>
        </section>

        <section class="feature-section">
            <div class="section-shell section-shell--tight feature-grid">
                <article v-for="item in features" :key="item.title" class="feature-card">
                    <span class="feature-card__pill">
                        <el-icon :size="24"><component :is="item.icon" /></el-icon>
                    </span>
                    <h2>{{ item.title }}</h2>
                    <p>{{ item.desc }}</p>
                </article>
            </div>
        </section>

        <section class="showcase-section section-shell">
            <div class="section-head">
                <div>
                    <p class="section-head__eyebrow">Showcase</p>
                    <h2>前沿生图展示</h2>
                </div>
            </div>

            <div class="preview-grid">
                <article v-for="url in previews" :key="url" class="preview-card">
                    <img :src="url" alt="showcase" referrerpolicy="no-referrer" />
                </article>
            </div>
        </section>

        <section class="cta-section">
            <div class="section-shell cta-card">
                <h2>准备好开始大规模生图了吗？</h2>
                <p>注册后即可创建密钥、查看额度与管理历史任务。</p>
                <router-link :to="primaryHref" class="hero-action hero-action--primary">{{ primaryLabel }}</router-link>
            </div>
        </section>
    </div>
</template>

<style scoped lang="scss">
.home-page {
    padding-bottom: 56px;
}

.section-shell {
    width: min(1200px, calc(100vw - 32px));
    margin: 0 auto;
}

.section-shell--tight {
    width: min(1200px, calc(100vw - 48px));
}

.hero-section {
    width: min(1200px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 80px 0 96px;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(320px, 480px);
    gap: 40px;
    align-items: center;
}

.hero-section__copy {
    min-width: 0;
}

.hero-badge {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 16px;
    border: 1px solid rgba(96, 165, 250, 0.22);
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.08);
    color: #60a5fa;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
}

.hero-section h1 {
    margin: 24px 0 0;
    font-size: clamp(48px, 7vw, 78px);
    line-height: 1.05;
    letter-spacing: -0.04em;

    span {
        display: inline-block;
        margin-left: 12px;
        background: linear-gradient(135deg, #60a5fa, #a855f7 60%, #22d3ee);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        font-style: italic;
    }
}

.hero-section__copy > p {
    max-width: 620px;
    margin: 22px 0 0;
    font-size: 18px;
    line-height: 1.8;
    color: rgba(226, 232, 240, 0.7);
}

.hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 32px;
}

.hero-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 54px;
    padding: 0 24px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #ffffff;
    text-decoration: none;
    font-size: 15px;
    font-weight: 700;
    transition:
        transform 0.2s ease,
        border-color 0.2s ease,
        background 0.2s ease;
}

.hero-action:hover {
    transform: translateY(-1px);
}

.hero-action--primary {
    border-color: rgba(96, 165, 250, 0.28);
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    box-shadow: 0 22px 50px rgba(37, 99, 235, 0.22);
}

.hero-action--ghost {
    background: rgba(255, 255, 255, 0.04);
}

.hero-action--ghost:hover {
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
}

.hero-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    margin-top: 36px;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);

    article {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    strong {
        font-size: 28px;
        line-height: 1.1;
    }

    span {
        font-size: 12px;
        letter-spacing: 0.08em;
        color: rgba(226, 232, 240, 0.54);
        text-transform: uppercase;
    }
}

.hero-terminal {
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 28px;
    overflow: hidden;
    background: rgba(13, 13, 13, 0.92);
    box-shadow: 0 36px 80px rgba(2, 6, 23, 0.48);
}

.hero-terminal__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);

    small {
        color: rgba(226, 232, 240, 0.44);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }
}

.hero-terminal__dots {
    display: flex;
    gap: 8px;

    span {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: rgba(248, 113, 113, 0.8);

        &:nth-child(2) {
            background: rgba(251, 191, 36, 0.8);
        }

        &:nth-child(3) {
            background: rgba(74, 222, 128, 0.8);
        }
    }
}

.hero-terminal__body {
    padding: 28px 24px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
    font-size: 13px;
    line-height: 1.8;
    color: rgba(226, 232, 240, 0.84);

    p {
        margin: 0;
    }

    span {
        color: #60a5fa;
    }
}

.feature-section {
    padding: 72px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
}

.feature-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
}

.feature-card {
    padding: 28px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.04);

    h2 {
        margin: 18px 0 0;
        font-size: 24px;
    }

    p {
        margin: 12px 0 0;
        font-size: 14px;
        line-height: 1.8;
        color: rgba(226, 232, 240, 0.66);
    }
}

.feature-card__pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(124, 58, 237, 0.9));
    box-shadow: 0 20px 40px rgba(37, 99, 235, 0.22);
    color: #ffffff;
}

.showcase-section {
    padding: 88px 0;
}

.section-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 28px;

    h2 {
        margin: 8px 0 0;
        font-size: 42px;
        font-style: italic;
        letter-spacing: -0.04em;
    }
}

.section-head__eyebrow {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(96, 165, 250, 0.8);
}

.section-link {
    color: rgba(226, 232, 240, 0.72);
    text-decoration: none;
    font-size: 14px;
}

.preview-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 18px;
}

.preview-card {
    aspect-ratio: 1 / 1;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.03);

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.4s ease;
    }

    &:hover img {
        transform: scale(1.04) rotate(1deg);
    }
}

.cta-section {
    padding: 0 0 36px;
}

.cta-card {
    padding: 64px 24px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 36px;
    background: linear-gradient(180deg, rgba(19, 25, 40, 0.88), rgba(13, 17, 28, 0.92));
    text-align: center;

    h2 {
        margin: 0;
        font-size: clamp(34px, 5vw, 52px);
        letter-spacing: -0.04em;
    }

    p {
        max-width: 560px;
        margin: 16px auto 28px;
        font-size: 16px;
        line-height: 1.8;
        color: rgba(226, 232, 240, 0.68);
    }
}

@media (max-width: 960px) {
    .hero-section,
    .feature-grid,
    .preview-grid {
        grid-template-columns: 1fr;
    }

    .preview-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .section-head {
        flex-direction: column;
        align-items: flex-start;
    }
}

@media (max-width: 640px) {
    .section-shell,
    .hero-section {
        width: min(1200px, calc(100vw - 24px));
    }

    .hero-section {
        padding: 56px 0 72px;
    }

    .hero-section h1 span {
        margin-left: 0;
    }

    .hero-stats,
    .preview-grid {
        grid-template-columns: 1fr;
    }

    .feature-section,
    .showcase-section {
        padding: 56px 0;
    }

    .cta-card {
        padding: 44px 18px;
    }
}
</style>
