<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/utils/format'
import {
  adminCreatePrompt,
  adminDeletePrompt,
  adminListPrompts,
  adminUpdatePrompt,
  type PromptLibraryItem,
  type PromptLibraryPayload,
} from '@/api/prompt'

const rows = ref<PromptLibraryItem[]>([])
const total = ref(0)
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const editingID = ref<number | null>(null)
const page = reactive({ limit: 20, offset: 0 })
const filters = reactive<{ keyword: string; category: string; enabled: boolean | '' }>({
  keyword: '',
  category: '',
  enabled: '',
})

const form = reactive<PromptLibraryPayload & { tagText: string }>({
  title: '',
  content: '',
  category: '通用',
  preview_image_url: '',
  tags: [],
  tagText: '',
  enabled: true,
  sort_order: 0,
})

const currentPage = computed({
  get: () => Math.floor(page.offset / page.limit) + 1,
  set: (value: number) => {
    page.offset = Math.max(0, value - 1) * page.limit
  },
})

const categories = computed(() => {
  const set = new Set<string>()
  rows.value.forEach((row) => {
    const value = row.category?.trim()
    if (value) set.add(value)
  })
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

async function load() {
  loading.value = true
  try {
    const params = {
      keyword: filters.keyword.trim() || undefined,
      category: filters.category.trim() || undefined,
      enabled: filters.enabled,
      limit: page.limit,
      offset: page.offset,
    }
    const data = await adminListPrompts(params)
    rows.value = data.items || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

async function search() {
  page.offset = 0
  await load()
}

function resetForm() {
  editingID.value = null
  form.title = ''
  form.content = ''
  form.category = '通用'
  form.preview_image_url = ''
  form.tags = []
  form.tagText = ''
  form.enabled = true
  form.sort_order = 0
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: PromptLibraryItem) {
  editingID.value = row.id
  form.title = row.title
  form.content = row.content
  form.category = row.category || '通用'
  form.preview_image_url = row.preview_image_url || ''
  form.tags = row.tags || []
  form.tagText = (row.tags || []).join('，')
  form.enabled = row.enabled
  form.sort_order = row.sort_order
  dialogVisible.value = true
}

function parseTags(value: string) {
  const seen = new Set<string>()
  const tags: string[] = []
  value.split(/[，,\n]/).forEach((raw) => {
    const tag = raw.trim()
    if (!tag || seen.has(tag)) return
    seen.add(tag)
    tags.push(tag)
  })
  return tags
}

function validateForm() {
  const title = form.title.trim()
  const content = form.content.trim()
  const category = form.category.trim() || '通用'
  const previewImageURL = form.preview_image_url.trim()
  const tags = parseTags(form.tagText)
  if (!title) {
    ElMessage.warning('请输入 Prompt 标题')
    return false
  }
  if (title.length > 160) {
    ElMessage.warning('Prompt 标题最多 160 个字符')
    return false
  }
  if (!content) {
    ElMessage.warning('请输入 Prompt 内容')
    return false
  }
  if (content.length > 10000) {
    ElMessage.warning('Prompt 内容最多 10000 个字符')
    return false
  }
  if (category.length > 80) {
    ElMessage.warning('分类最多 80 个字符')
    return false
  }
  if (previewImageURL.length > 2048) {
    ElMessage.warning('预览图 URL 最多 2048 个字符')
    return false
  }
  if (previewImageURL) {
    try {
      const url = new URL(previewImageURL)
      if (!['http:', 'https:'].includes(url.protocol)) {
        ElMessage.warning('预览图 URL 仅支持 http 或 https')
        return false
      }
    } catch {
      ElMessage.warning('请输入正确的预览图 URL')
      return false
    }
  }
  if (tags.length > 10) {
    ElMessage.warning('标签最多 10 个')
    return false
  }
  return true
}

function buildPayload(): PromptLibraryPayload {
  return {
    title: form.title.trim(),
    content: form.content.trim(),
    category: form.category.trim() || '通用',
    preview_image_url: form.preview_image_url.trim(),
    tags: parseTags(form.tagText).slice(0, 10),
    enabled: form.enabled,
    sort_order: Number(form.sort_order) || 0,
  }
}

async function submit() {
  if (!validateForm()) return
  submitting.value = true
  try {
    const payload = buildPayload()
    if (editingID.value) {
      await adminUpdatePrompt(editingID.value, payload)
      ElMessage.success('Prompt 已保存')
    } else {
      await adminCreatePrompt(payload)
      ElMessage.success('Prompt 已创建')
    }
    dialogVisible.value = false
    await load()
  } finally {
    submitting.value = false
  }
}

async function remove(row: PromptLibraryItem) {
  const confirmed = await ElMessageBox.confirm(
    `确认删除 Prompt“${row.title}”？`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  ).then(() => true).catch(() => false)
  if (!confirmed || !row.id) return
  await adminDeletePrompt(row.id)
  ElMessage.success('Prompt 已删除')
  await load()
}

async function handleSizeChange(size: number) {
  page.limit = size
  page.offset = 0
  await load()
}

async function handleCurrentChange(value: number) {
  currentPage.value = value
  await load()
}

function contentSummary(value: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= 80) return text
  return `${text.slice(0, 80)}…`
}

onMounted(load)
</script>

<template>
  <div class="page-container">
    <div class="card-block prompt-library-card">
      <div class="flex-between prompt-library-head">
        <div>
          <h2 class="page-title" style="margin: 0">Prompt库</h2>
          <div class="prompt-library-subtitle">维护 web 用户端生图灵感库，启用状态的 Prompt 会在用户端展示。</div>
        </div>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon> 新增 Prompt
        </el-button>
      </div>

      <el-form class="prompt-library-filter" inline @submit.prevent>
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" clearable placeholder="标题、内容、标签" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="filters.category" clearable placeholder="输入分类" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.enabled" clearable placeholder="全部" style="width: 120px">
            <el-option label="全部" :value="''" />
            <el-option label="启用" :value="true" />
            <el-option label="停用" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">搜索</el-button>
          <el-button @click="filters.keyword = ''; filters.category = ''; filters.enabled = ''; search()">重置</el-button>
        </el-form-item>
      </el-form>

      <div v-if="categories.length" class="prompt-category-strip">
        <el-tag v-for="name in categories" :key="name" effect="plain">{{ name }}</el-tag>
      </div>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column label="预览图" width="96">
          <template #default="{ row }">
            <img
              v-if="row.preview_image_url"
              class="prompt-preview-thumb"
              :src="row.preview_image_url"
              :alt="`${row.title}预览图`"
              loading="lazy"
            >
            <span v-else class="empty-text">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="120" show-overflow-tooltip />
        <el-table-column label="标签" min-width="180">
          <template #default="{ row }">
            <div class="tag-list">
              <el-tag v-for="tag in row.tags || []" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
              <span v-if="!(row.tags || []).length" class="empty-text">—</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="内容摘要" min-width="300" show-overflow-tooltip>
          <template #default="{ row }">{{ contentSummary(row.content) }}</template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="90" align="right" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="190">
          <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">修改</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="prompt-library-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="page.limit"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editingID ? '修改 Prompt' : '新增 Prompt'"
      width="720px"
      @closed="resetForm"
    >
      <el-form label-width="92px">
        <el-form-item label="标题" required>
          <el-input v-model.trim="form.title" maxlength="160" show-word-limit placeholder="请输入 Prompt 标题" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model.trim="form.category" maxlength="80" placeholder="默认通用" />
        </el-form-item>
        <el-form-item label="预览图 URL">
          <el-input
            v-model.trim="form.preview_image_url"
            maxlength="2048"
            show-word-limit
            placeholder="https://cdn.example.com/prompt-preview.webp"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="form.tagText" maxlength="300" placeholder="多个标签可用逗号或换行分隔，最多 10 个" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="12"
            maxlength="10000"
            show-word-limit
            placeholder="请输入完整 Prompt 内容"
          />
        </el-form-item>
        <el-form-item label="排序值">
          <el-input-number v-model="form.sort_order" :min="-999999" :max="999999" />
          <span class="form-tip">数值越大越靠前，同排序按创建顺序倒序展示</span>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.prompt-library-head {
  margin-bottom: 14px;
}

.prompt-library-subtitle,
.form-tip,
.empty-text {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.prompt-library-subtitle {
  margin-top: 4px;
}

.prompt-library-filter {
  align-items: center;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding: 14px 14px 0;
}

.prompt-category-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prompt-preview-thumb {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  display: block;
  height: 56px;
  object-fit: cover;
  width: 56px;
}

.form-tip {
  margin-left: 10px;
}

.prompt-library-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
