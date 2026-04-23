<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { fetchPublicModels } from '@/api/settings';
import type { PublicModel } from '@/api/settings';
import { ENABLE_CHAT_MODEL } from '@/config/feature';
import { formatCredit } from '@/utils/format';

const rows = ref<PublicModel[]>([]);
const loading = ref(false);
const visibleRows = computed(() => (ENABLE_CHAT_MODEL ? rows.value : rows.value.filter((row) => row.type === 'image')));

async function load() {
    loading.value = true;
    try {
        const d = await fetchPublicModels();
        rows.value = d.items;
    } finally {
        loading.value = false;
    }
}

function formatPerCall(v: number) {
    return v > 0 ? `${formatCredit(v)} 积分 / 次` : '—';
}

onMounted(load);

const highlights = [
    { title: '¥1 即可启用', desc: '超低充值门槛' },
    { title: '额度永久有效', desc: '无过期时间压力' },
    { title: '秒级订单同步', desc: '账单明细清晰透明' },
];
</script>

<template>
    <div class="pricing-page section-shell">
        <div class="pricing-head">
            <h1>按次计费，实时透明</h1>
            <p>无需订阅，仅针对单次成功调用计费，适合测试、集成与长期使用。</p>
        </div>

        <section class="pricing-card">
            <div class="pricing-card__head">
                <div>
                    <h2>模型计费详情</h2>
                    <p>仅展示当前对外开放且启用的模型，价格单位为积分。</p>
                </div>
                <router-link to="/register" class="pricing-cta">立即充值开启</router-link>
            </div>

            <div class="pricing-table">
                <table>
                    <thead>
                        <tr>
                            <th>支持模型</th>
                            <th>模型类型</th>
                            <th>按次价格</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="3" class="state-cell">正在加载模型价格…</td>
                        </tr>
                        <tr v-else-if="visibleRows.length === 0">
                            <td colspan="3" class="state-cell">当前暂无已启用模型</td>
                        </tr>
                        <tr v-for="row in visibleRows" :key="row.slug">
                            <td>
                                <div class="model-cell">
                                    <strong>{{ row.slug }}</strong>
                                    <span v-if="row.description">{{ row.description }}</span>
                                </div>
                            </td>
                            <td>{{ row.type === 'image' ? '生图' : '对话' }}</td>
                            <td>{{ formatPerCall(row.price_per_call) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="pricing-highlights">
                <article v-for="item in highlights" :key="item.title">
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.desc }}</span>
                </article>
            </div>
        </section>
    </div>
</template>

<style scoped lang="scss">
.section-shell {
    width: min(1280px, calc(100vw - 32px));
    margin: 0 auto;
}

.pricing-page {
    padding: 72px 0 88px;
}

.back-link {
    display: inline-flex;
    color: rgba(226, 232, 240, 0.7);
    text-decoration: none;
    font-size: 14px;
}

.pricing-head {
    text-align: center;

    h1 {
        margin: 20px 0 0;
        font-size: clamp(40px, 6vw, 68px);
        font-style: italic;
        letter-spacing: -0.04em;
    }

    p {
        max-width: 620px;
        margin: 18px auto 0;
        font-size: 18px;
        line-height: 1.8;
        color: rgba(226, 232, 240, 0.66);
    }
}

.pricing-card {
    margin-top: 44px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 32px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.03);
    box-shadow: 0 30px 80px rgba(2, 6, 23, 0.36);
}

.pricing-card__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 28px 30px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);

    h2 {
        margin: 0;
        font-size: 30px;
    }

    p {
        margin: 8px 0 0;
        font-size: 14px;
        color: rgba(226, 232, 240, 0.62);
    }
}

.pricing-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 20px;
    border-radius: 999px;
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    color: #ffffff;
    text-decoration: none;
    font-size: 14px;
    font-weight: 700;
}

.pricing-table {
    overflow-x: auto;

    table {
        width: 100%;
        min-width: 560px;
        border-collapse: collapse;
    }

    th,
    td {
        padding: 22px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        text-align: left;
        font-size: 14px;
        vertical-align: top;
    }

    th {
        color: rgba(226, 232, 240, 0.56);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    td:first-child {
        min-width: 220px;
    }

    td:nth-child(n + 3) {
        min-width: 148px;
    }
}

.model-cell {
    display: flex;
    flex-direction: column;
    gap: 6px;

    strong {
        font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
        color: rgba(248, 250, 252, 0.92);
        font-weight: 700;
    }

    span {
        color: rgba(226, 232, 240, 0.62);
        line-height: 1.6;
    }
}

.state-cell {
    text-align: center !important;
    color: rgba(226, 232, 240, 0.66);
}

.pricing-highlights {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    background: rgba(255, 255, 255, 0.06);

    article {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 24px;
        background: rgba(37, 99, 235, 0.06);
        text-align: center;
    }

    strong {
        font-size: 22px;
    }

    span {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(226, 232, 240, 0.58);
    }
}

@media (max-width: 960px) {
    .pricing-card__head {
        flex-direction: column;
        align-items: flex-start;
    }

    .pricing-highlights {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 640px) {
    .section-shell {
        width: min(1280px, calc(100vw - 24px));
    }

    .pricing-page {
        padding: 56px 0 72px;
    }

    .pricing-card__head,
    .pricing-table th,
    .pricing-table td,
    .pricing-highlights article {
        padding-left: 18px;
        padding-right: 18px;
    }
}
</style>
