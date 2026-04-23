<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { deleteMyImageTask, listMyImageTasks, type ImageTask } from '@/api/me';
import { formatCredit, formatDateTime } from '@/utils/format';

type FlattenedImageTask = {
    task: ImageTask;
    image_url: string;
    image_index: number;
    image_total: number;
    image_key: string;
};

const imageTasks = ref<ImageTask[]>([]);
const imagePage = ref({ limit: 12, offset: 0 });
const imageLoading = ref(false);
const hasMoreImage = ref(false);
const deletingTaskID = ref('');
const previewVisible = ref(false);
const previewList = ref<string[]>([]);
const previewIndex = ref(0);

const flattenedImageTasks = computed<FlattenedImageTask[]>(() =>
    imageTasks.value.flatMap((task) => {
        const urls = task.thumb_urls?.length ? task.thumb_urls : task.image_urls;
        const imageTotal = urls?.length || task.image_urls?.length || 0;
        const safeURLs = urls?.length ? urls : [''];
        return safeURLs.map((imageURL, index) => ({
            task,
            image_url: imageURL,
            image_index: index,
            image_total: imageTotal,
            image_key: `${task.task_id}-${index}`,
        }));
    }),
);

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
    if (!urls.length || !urls[idx]) return;
    previewList.value = urls;
    previewIndex.value = idx;
    previewVisible.value = true;
}

function emptyImageLabel(task: ImageTask) {
    if (task.status === 'success') return '已过期';
    return statusLabel(task.status);
}

async function onDeleteTask(task: ImageTask) {
    try {
        await ElMessageBox.confirm(
            '确定删除该历史任务吗？删除后将从历史任务列表隐藏，原始记录保留为软删除状态。',
            '删除确认',
            {
                confirmButtonText: '删除',
                cancelButtonText: '取消',
                type: 'warning',
            },
        );
    } catch {
        return;
    }
    deletingTaskID.value = task.task_id;
    try {
        await deleteMyImageTask(task.task_id);
        imageTasks.value = imageTasks.value.filter((item) => item.task_id !== task.task_id);
        if (previewVisible.value && previewList.value[0] === task.image_urls?.[0]) {
            previewVisible.value = false;
            previewList.value = [];
            previewIndex.value = 0;
        }
        ElMessage.success('已删除');
    } catch (e: any) {
        ElMessage.error(e?.message || '删除失败');
    } finally {
        deletingTaskID.value = '';
    }
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
                    <el-card v-for="item in flattenedImageTasks" :key="item.image_key" shadow="hover" class="img-card">
                        <div
                            class="thumb"
                            :class="{ 'is-clickable': !!item.image_url }"
                            @click="openPreview(item.task.image_urls, item.image_index)"
                        >
                            <img v-if="item.image_url" :src="item.image_url" :alt="item.task.prompt" />
                            <div v-if="item.image_url" class="thumb-mask">
                                <el-icon><ZoomIn /></el-icon>
                                <span>点击放大查看</span>
                            </div>
                            <div v-else class="thumb-ph">
                                <el-icon :size="32"><PictureRounded /></el-icon>
                                <div class="s">{{ emptyImageLabel(item.task) }}</div>
                            </div>
                        </div>
                        <div class="meta">
                            <div class="meta-top">
                                <div class="title" :title="item.task.prompt">{{ item.task.prompt || '(无 prompt)' }}</div>
                                <el-button
                                    link
                                    type="danger"
                                    size="small"
                                    :loading="deletingTaskID === item.task.task_id"
                                    @click.stop="onDeleteTask(item.task)"
                                >
                                    {{ deletingTaskID === item.task.task_id ? '删除中...' : '删除' }}
                                </el-button>
                            </div>
                            <div class="sub">
                                <el-tag size="small" :type="statusTag(item.task.status)">{{ statusLabel(item.task.status) }}</el-tag>
                                <span>{{ item.task.size }}</span>
                                <span class="mute" v-if="item.image_total > 0">第{{ item.image_index + 1 }}张，共{{ item.image_total }}张</span>
                                <span class="mute" v-else>结果图缺失</span>
                            </div>
                            <div class="foot">
                                <span class="mute">{{ formatDateTime(item.task.created_at) }}</span>
                                <span class="credit">{{ formatCredit(item.task.credit_cost) }} 积分</span>
                            </div>
                            <div v-if="item.task.error" class="err">{{ item.task.error }}</div>
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
    .meta-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
    }
    .title {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        flex: 1;
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
