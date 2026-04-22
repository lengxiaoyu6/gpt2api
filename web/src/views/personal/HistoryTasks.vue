<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { listMyImageTasks, type ImageTask } from '@/api/me';
import { formatCredit, formatDateTime } from '@/utils/format';

const imageTasks = ref<ImageTask[]>([]);
const imagePage = ref({ limit: 12, offset: 0 });
const imageLoading = ref(false);
const hasMoreImage = ref(false);
const previewVisible = ref(false);
const previewList = ref<string[]>([]);
const previewIndex = ref(0);

async function loadImageTasks(reset = true) {
    imageLoading.value = true;
    try {
        if (reset) {
            imagePage.value.offset = 0;
            imageTasks.value = [];
        }
        const data = await listMyImageTasks({
            limit: imagePage.value.limit,
            offset: imagePage.value.offset,
        });
        if (reset) imageTasks.value = data.items;
        else imageTasks.value.push(...data.items);
        hasMoreImage.value = data.items.length >= imagePage.value.limit;
    } finally {
        imageLoading.value = false;
    }
}

function imageLoadMore() {
    imagePage.value.offset += imagePage.value.limit;
    loadImageTasks(false);
}

function openPreview(urls: string[], idx = 0) {
    if (!urls.length) return;
    previewList.value = urls;
    previewIndex.value = idx;
    previewVisible.value = true;
}

const statusMap: Record<string, { tag: 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
    queued: { tag: 'warning', label: '排队中' },
    dispatched: { tag: 'warning', label: '已派发' },
    running: { tag: 'warning', label: '处理中' },
    success: { tag: 'success', label: '成功' },
    failed: { tag: 'danger', label: '失败' },
};

function statusTag(s: string): 'success' | 'warning' | 'danger' | 'info' {
    return statusMap[s]?.tag || 'info';
}

function statusLabel(s: string) {
    return statusMap[s]?.label || s || '-';
}

onMounted(() => {
    loadImageTasks(true);
});
</script>

<template>
    <div class="page-container">
        <div class="card-block hero">
            <div>
                <h2 class="page-title">历史任务</h2>
                <p class="desc">当前页面展示图片生成任务记录，可刷新并继续加载更多。</p>
            </div>
        </div>

        <div class="card-block">
            <div class="flex-between" style="margin-bottom: 10px">
                <h3 class="section-title">图片任务历史</h3>
                <el-button size="small" @click="loadImageTasks(true)">刷新</el-button>
            </div>
            <div v-loading="imageLoading">
                <div v-if="imageTasks.length === 0 && !imageLoading" class="empty">
                    暂无图片任务，复制接口文档中的图片代码调用一次或者在线体验即可生成记录。
                </div>
                <div class="grid">
                    <el-card v-for="t in imageTasks" :key="t.id" shadow="hover" class="img-card">
                        <div class="thumb" :class="{ 'is-clickable': !!t.image_urls?.length }" @click="openPreview(t.image_urls, 0)">
                            <img v-if="t.image_urls?.[0]" :src="t.image_urls[0]" :alt="t.prompt" />
                            <div v-if="t.image_urls?.[0]" class="thumb-mask">
                                <el-icon><ZoomIn /></el-icon>
                                <span>点击放大查看</span>
                            </div>
                            <div v-else class="thumb-ph">
                                <el-icon :size="32"><PictureRounded /></el-icon>
                                <div class="s">{{ statusLabel(t.status) }}</div>
                            </div>
                        </div>
                        <div class="meta">
                            <div class="title" :title="t.prompt">{{ t.prompt || '(无 prompt)' }}</div>
                            <div class="sub">
                                <el-tag size="small" :type="statusTag(t.status)">{{ statusLabel(t.status) }}</el-tag>
                                <span>{{ t.size }}</span>
                                <span class="mute">n={{ t.n }}</span>
                            </div>
                            <div class="foot">
                                <span class="mute">{{ formatDateTime(t.created_at) }}</span>
                                <span class="credit">{{ formatCredit(t.credit_cost) }} 积分</span>
                            </div>
                            <div v-if="t.error" class="err">{{ t.error }}</div>
                        </div>
                    </el-card>
                </div>
                <div v-if="hasMoreImage" class="pager">
                    <el-button @click="imageLoadMore">加载更多</el-button>
                </div>
            </div>
        </div>

        <el-image-viewer
            v-if="previewVisible"
            :url-list="previewList"
            :initial-index="previewIndex"
            teleported
            @close="previewVisible = false"
        />
    </div>
</template>

<style scoped lang="scss">
.page-container {
    padding: 16px;
}
.page-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
}
.section-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}
.card-block {
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
}
.flex-between {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.hero {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
    .desc {
        color: var(--el-text-color-secondary);
        margin-top: 4px;
        font-size: 13px;
    }
}
.mute {
    color: var(--el-text-color-secondary);
}
.pager {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
}
.empty {
    padding: 24px 0;
    color: var(--el-text-color-secondary);
    text-align: center;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
}
.img-card {
    :deep(.el-card__body) {
        padding: 0;
    }
    .thumb {
        height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        background: var(--el-fill-color-lighter);
        overflow: hidden;
        img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            transition: transform 0.25s ease;
        }
        &.is-clickable {
            cursor: zoom-in;
        }
        &.is-clickable:hover {
            img {
                transform: scale(1.03);
            }
            .thumb-mask {
                opacity: 1;
            }
        }
    }
    .thumb-mask {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: #fff;
        font-size: 12px;
        background: rgba(15, 23, 42, 0.45);
        opacity: 0;
        transition: opacity 0.2s ease;
    }
    .thumb-ph {
        text-align: center;
        color: var(--el-text-color-secondary);
        .s {
            font-size: 12px;
        }
    }
    .meta {
        padding: 10px 12px;
    }
    .title {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }
    .sub {
        display: flex;
        gap: 6px;
        font-size: 12px;
        align-items: center;
        color: var(--el-text-color-regular);
    }
    .foot {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 12px;
        .credit {
            color: #e6a23c;
            font-weight: 600;
        }
    }
    .err {
        color: var(--el-color-danger);
        font-size: 12px;
        margin-top: 6px;
        background: var(--el-color-danger-light-9);
        padding: 4px 6px;
        border-radius: 4px;
        white-space: pre-wrap;
        word-break: break-word;
    }
}

@media (max-width: 640px) {
    .hero {
        flex-direction: column;
    }
}
</style>
