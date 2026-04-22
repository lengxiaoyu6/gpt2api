<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as rechargeApi from '@/api/recharge'
import { formatCredit } from '@/utils/format'

const rows = ref<rechargeApi.RedeemCode[]>([])
const total = ref(0)
const loading = ref(false)
const submitting = ref(false)

const filter = reactive({
  batch_id: '',
  status: '' as '' | 'active' | 'used',
  limit: 20,
  offset: 0,
})

const generateDialog = reactive({
  visible: false,
  credits: 100000,
  quantity: 10,
})

async function load() {
  loading.value = true
  try {
    const data = await rechargeApi.adminListRedeemCodes({
      batch_id: filter.batch_id || undefined,
      status: filter.status || undefined,
      limit: filter.limit,
      offset: filter.offset,
    })
    rows.value = data.items || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

function openGenerate() {
  generateDialog.credits = 100000
  generateDialog.quantity = 10
  generateDialog.visible = true
}

async function submitGenerate() {
  if (generateDialog.credits <= 0) {
    ElMessage.warning('积分面额必须大于 0')
    return
  }
  if (generateDialog.quantity <= 0) {
    ElMessage.warning('生成数量必须大于 0')
    return
  }

  submitting.value = true
  try {
    const data = await rechargeApi.adminGenerateRedeemCodes({
      credits: generateDialog.credits,
      quantity: generateDialog.quantity,
    })
    const batchID = data.items?.[0]?.batch_id || ''
    generateDialog.visible = false
    if (batchID) {
      filter.batch_id = batchID
      filter.offset = 0
    }
    await load()
    ElMessage.success(`已生成 ${data.total} 个兑换码${batchID ? `，批次 ${batchID}` : ''}`)
  } finally {
    submitting.value = false
  }
}

function onSearch() {
  filter.offset = 0
  load()
}

function onReset() {
  filter.batch_id = ''
  filter.status = ''
  filter.offset = 0
  load()
}

const currentPage = computed<number>({
  get() { return Math.floor(filter.offset / filter.limit) + 1 },
  set(v) {
    filter.offset = (v - 1) * filter.limit
    load()
  },
})

function codeStatus(row: rechargeApi.RedeemCode) {
  if (row.used_by_user_id > 0 || row.used_at) {
    return { label: '已使用', type: 'info' as const }
  }
  return { label: '未使用', type: 'success' as const }
}

function fmtUser(row: rechargeApi.RedeemCode) {
  return row.used_by_user_id > 0 ? `#${row.used_by_user_id}` : '—'
}

function fmtTime(value?: string | null) {
  return value || '—'
}

onMounted(load)
</script>

<template>
  <div class="page-container">
    <div class="card-block">
      <div class="flex-between" style="margin-bottom: 12px">
        <div>
          <h2 class="page-title" style="margin: 0">兑换码</h2>
          <div style="color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px">
            支持按面额批量生成兑换码，并查看每个兑换码的使用状态。
          </div>
        </div>
        <el-button type="primary" @click="openGenerate">
          <el-icon><Plus /></el-icon> 生成兑换码
        </el-button>
      </div>

      <el-form :inline="true" class="filter-form">
        <el-form-item label="批次号">
          <el-input v-model.trim="filter.batch_id" clearable placeholder="输入批次号" style="width: 220px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filter.status" clearable placeholder="全部" style="width: 140px">
            <el-option label="未使用" value="active" />
            <el-option label="已使用" value="used" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="onSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="onReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="code" label="兑换码" min-width="220">
          <template #default="{ row }">
            <code>{{ row.code }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="batch_id" label="批次号" min-width="180" />
        <el-table-column label="面额" width="120" align="right">
          <template #default="{ row }">{{ formatCredit(row.credits) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="codeStatus(row).type" size="small">{{ codeStatus(row).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="使用者" width="100">
          <template #default="{ row }">{{ fmtUser(row) }}</template>
        </el-table-column>
        <el-table-column label="使用时间" width="180">
          <template #default="{ row }">{{ fmtTime(row.used_at) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top: 12px"
        background
        layout="total, prev, pager, next, sizes"
        :total="total"
        v-model:current-page="currentPage"
        :page-sizes="[20, 50, 100]"
        v-model:page-size="filter.limit"
        @size-change="() => { filter.offset = 0; load() }"
      />
    </div>

    <el-dialog v-model="generateDialog.visible" title="生成兑换码" width="460px">
      <el-form label-width="110px">
        <el-form-item label="积分面额">
          <el-input-number v-model="generateDialog.credits" :min="1" :step="10000" style="width: 220px" />
          <span class="form-tip">{{ formatCredit(generateDialog.credits) }} 积分</span>
        </el-form-item>
        <el-form-item label="生成数量">
          <el-input-number v-model="generateDialog.quantity" :min="1" :max="500" style="width: 220px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="generateDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitGenerate">确认生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
code {
  background: #f2f3f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.form-tip {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

:global(html.dark) code {
  background: #1d2026;
}
</style>
