<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as imageFilesApi from '@/api/image-files'
import { formatBytes, formatDateTime } from '@/utils/format'

const statsLoading = ref(false)
const stats = ref<imageFilesApi.ImageFileStats | null>(null)

const originalLoading = ref(false)
const originalItems = ref<imageFilesApi.ImageFileItem[]>([])
const originalTotal = ref(0)
const originalSelected = ref<imageFilesApi.ImageFileItem[]>([])
const originalPager = reactive({ limit: 20, offset: 0 })

const thumbLoading = ref(false)
const thumbItems = ref<imageFilesApi.ImageFileItem[]>([])
const thumbTotal = ref(0)
const thumbSelected = ref<imageFilesApi.ImageFileItem[]>([])
const thumbPager = reactive({ limit: 20, offset: 0 })

const originalPage = computed({
  get: () => Math.floor(originalPager.offset / originalPager.limit) + 1,
  set: (v: number) => { originalPager.offset = (v - 1) * originalPager.limit },
})

const thumbPage = computed({
  get: () => Math.floor(thumbPager.offset / thumbPager.limit) + 1,
  set: (v: number) => { thumbPager.offset = (v - 1) * thumbPager.limit },
})

async function loadStats() {
  statsLoading.value = true
  try {
    stats.value = await imageFilesApi.getImageFileStats()
  } finally {
    statsLoading.value = false
  }
}

async function loadOriginal() {
  originalLoading.value = true
  try {
    const data = await imageFilesApi.listOriginalImageFiles(originalPager.limit, originalPager.offset)
    originalItems.value = data.items
    originalTotal.value = data.total
    originalSelected.value = []
  } finally {
    originalLoading.value = false
  }
}

async function loadThumb() {
  thumbLoading.value = true
  try {
    const data = await imageFilesApi.listThumbImageFiles(thumbPager.limit, thumbPager.offset)
    thumbItems.value = data.items
    thumbTotal.value = data.total
    thumbSelected.value = []
  } finally {
    thumbLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadStats(), loadOriginal(), loadThumb()])
}

function onOriginalSelectionChange(rows: imageFilesApi.ImageFileItem[]) {
  originalSelected.value = rows
}

function onThumbSelectionChange(rows: imageFilesApi.ImageFileItem[]) {
  thumbSelected.value = rows
}

function onOriginalPageChange(page: number) {
  originalPage.value = page
  loadOriginal()
}

function onOriginalSizeChange(size: number) {
  originalPager.limit = size
  originalPager.offset = 0
  loadOriginal()
}

function onThumbPageChange(page: number) {
  thumbPage.value = page
  loadThumb()
}

function onThumbSizeChange(size: number) {
  thumbPager.limit = size
  thumbPager.offset = 0
  loadThumb()
}

async function confirmDelete(kind: 'original' | 'thumb', names: string[]) {
  if (!names.length) {
    ElMessage.warning('请选择文件')
    return
  }
  await ElMessageBox.confirm(
    `确认删除已选 ${names.length} 个${kind === 'original' ? '原图' : '缩略图'}文件？`,
    '删除确认',
    {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    },
  )

  if (kind === 'original') {
    await imageFilesApi.deleteOriginalImageFiles(names)
    ElMessage.success(`已删除 ${names.length} 个原图文件`)
    await Promise.all([loadStats(), loadOriginal()])
    return
  }

  await imageFilesApi.deleteThumbImageFiles(names)
  ElMessage.success(`已删除 ${names.length} 个缩略图文件`)
  await Promise.all([loadStats(), loadThumb()])
}

function deleteOneOriginal(row: imageFilesApi.ImageFileItem) {
  return confirmDelete('original', [row.name])
}

function deleteOneThumb(row: imageFilesApi.ImageFileItem) {
  return confirmDelete('thumb', [row.name])
}

onMounted(() => {
  refreshAll()
})
</script>

<template>
  <div class="page-container">
    <div class="card-block" v-loading="statsLoading">
      <div class="flex-between card-head">
        <div>
          <h2 class="page-title" style="margin:0">图片文件</h2>
          <div class="page-subtitle">
            展示原图目录、缩略图目录与所在分区容量，可批量删除无效文件。
          </div>
        </div>
        <el-button type="primary" @click="refreshAll">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-title">分区总容量</div>
          <div class="stat-value">{{ formatBytes(stats?.total_bytes) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">已用容量</div>
          <div class="stat-value">{{ formatBytes(stats?.used_bytes) }}</div>
          <div class="stat-sub">使用率 {{ (stats?.used_percent || 0).toFixed(1) }}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">剩余容量</div>
          <div class="stat-value">{{ formatBytes(stats?.free_bytes) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">原图目录占用</div>
          <div class="stat-value">{{ formatBytes(stats?.original_bytes) }}</div>
          <div class="stat-sub">{{ stats?.original_file_count || 0 }} 个文件</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">缩略图目录占用</div>
          <div class="stat-value">{{ formatBytes(stats?.thumb_bytes) }}</div>
          <div class="stat-sub">{{ stats?.thumb_file_count || 0 }} 个文件</div>
        </div>
      </div>
    </div>

    <div class="card-block">
      <div class="flex-between card-head">
        <div>
          <h3 class="section-title">原图文件列表</h3>
          <div class="section-subtitle">文件名格式为 {{ '<task_id>_<idx>' }}，支持多选删除。</div>
        </div>
        <div class="toolbar">
          <el-button @click="loadOriginal">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          <el-button
            type="danger"
            :disabled="originalSelected.length === 0"
            @click="confirmDelete('original', originalSelected.map(item => item.name))"
          >
            删除已选
          </el-button>
        </div>
      </div>

      <el-table
        v-loading="originalLoading"
        :data="originalItems"
        stripe
        row-key="name"
        @selection-change="onOriginalSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="name" label="文件名" min-width="220" show-overflow-tooltip />
        <el-table-column prop="task_id" label="任务 ID" min-width="220" show-overflow-tooltip />
        <el-table-column prop="idx" label="序号" width="80" />
        <el-table-column label="大小" width="120">
          <template #default="{ row }">{{ formatBytes(row.size_bytes) }}</template>
        </el-table-column>
        <el-table-column label="修改时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.modified_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="deleteOneOriginal(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top:16px;display:flex;justify-content:flex-end"
        :current-page="originalPage"
        :page-size="originalPager.limit"
        :page-sizes="[20, 50, 100]"
        :total="originalTotal"
        layout="total, sizes, prev, pager, next"
        @current-change="onOriginalPageChange"
        @size-change="onOriginalSizeChange"
      />
    </div>

    <div class="card-block">
      <div class="flex-between card-head">
        <div>
          <h3 class="section-title">缩略图文件列表</h3>
          <div class="section-subtitle">文件名格式为 {{ 'tmp_<task_id>_<idx>' }}，支持多选删除。</div>
        </div>
        <div class="toolbar">
          <el-button @click="loadThumb">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          <el-button
            type="danger"
            :disabled="thumbSelected.length === 0"
            @click="confirmDelete('thumb', thumbSelected.map(item => item.name))"
          >
            删除已选
          </el-button>
        </div>
      </div>

      <el-table
        v-loading="thumbLoading"
        :data="thumbItems"
        stripe
        row-key="name"
        @selection-change="onThumbSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="name" label="文件名" min-width="220" show-overflow-tooltip />
        <el-table-column prop="task_id" label="任务 ID" min-width="220" show-overflow-tooltip />
        <el-table-column prop="idx" label="序号" width="80" />
        <el-table-column label="大小" width="120">
          <template #default="{ row }">{{ formatBytes(row.size_bytes) }}</template>
        </el-table-column>
        <el-table-column label="修改时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.modified_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="deleteOneThumb(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top:16px;display:flex;justify-content:flex-end"
        :current-page="thumbPage"
        :page-size="thumbPager.limit"
        :page-sizes="[20, 50, 100]"
        :total="thumbTotal"
        layout="total, sizes, prev, pager, next"
        @current-change="onThumbPageChange"
        @size-change="onThumbSizeChange"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.page-container {
  padding: 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.page-subtitle,
.section-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.card-block {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.card-head {
  margin-bottom: 14px;
}

.flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.stat-card {
  padding: 14px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}

.stat-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.stat-value {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
