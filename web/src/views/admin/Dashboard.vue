<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { creditsSummary, listImageTasks, listUsers, type AdminImageTask, type CreditsSummary } from '@/api/admin'
import { getUsageStats, type StatsResp } from '@/api/stats'
import { adminListOrders } from '@/api/recharge'
import { formatCredit, formatDateTime } from '@/utils/format'

const router = useRouter()
const loading = ref(false)
const summary = ref<CreditsSummary | null>(null)
const usage = ref<StatsResp | null>(null)
const totalUsers = ref(0)
const totalAdmins = ref(0)
const pendingOrders = ref(0)
const recentImageTasks = ref<AdminImageTask[]>([])

function buildDateRange() {
  const now = new Date()
  const until = now.toISOString()
  const start = new Date(now)
  start.setDate(start.getDate() - 6)
  start.setHours(0, 0, 0, 0)
  const since = start.toISOString()
  return { since, until }
}

async function loadDashboard() {
  loading.value = true
  try {
    const { since, until } = buildDateRange()
    const [userPage, adminPage, credits, usageStats, rechargePage, imageTaskPage] = await Promise.all([
      listUsers({ limit: 1, offset: 0 }),
      listUsers({ role: 'admin', limit: 1, offset: 0 }),
      creditsSummary(),
      getUsageStats({ days: 7, since, until, top_n: 5 }),
      adminListOrders({ status: 'pending', limit: 1, offset: 0 }),
      listImageTasks({ page: 1, page_size: 5 }),
    ])

    totalUsers.value = userPage.total || 0
    totalAdmins.value = adminPage.total || 0
    summary.value = credits
    usage.value = usageStats
    pendingOrders.value = rechargePage.total || 0
    recentImageTasks.value = imageTaskPage.list || []
  } catch (err: any) {
    ElMessage.error(err?.message || '加载后台概览失败')
  } finally {
    loading.value = false
  }
}

const overall = computed(() => usage.value?.overall)
const daily = computed(() => usage.value?.daily || [])
const topModels = computed(() => usage.value?.by_model || [])
const topUsers = computed(() => usage.value?.by_user || [])
const maxDailyRequests = computed(() => {
  const max = daily.value.reduce((result, item) => Math.max(result, item.requests), 0)
  return max > 0 ? max : 1
})

const summaryCards = computed(() => [
  {
    title: '用户总数',
    value: String(totalUsers.value),
    detail: '已注册账号总量',
  },
  {
    title: '管理员数量',
    value: String(totalAdmins.value),
    detail: '拥有后台访问权限的账号',
  },
  {
    title: '待处理充值单',
    value: String(pendingOrders.value),
    detail: '等待人工处理或核销',
  },
  {
    title: '全站余额',
    value: `${formatCredit(summary.value?.total_balance)} 积分`,
    detail: '所有账号当前可用余额',
  },
  {
    title: '今日入账',
    value: `${formatCredit(summary.value?.in_today)} 积分`,
    detail: `近 7 天入账 ${formatCredit(summary.value?.in_7days)} 积分`,
  },
  {
    title: '近 7 天请求数',
    value: String(overall.value?.requests ?? 0),
    detail: `失败 ${overall.value?.failures ?? 0} · 扣费 ${formatCredit(overall.value?.credit_cost)} 积分`,
  },
])

const quickLinks = [
  { title: '用户管理', path: '/admin/users', desc: '查询账号状态、角色与分组。' },
  { title: '充值订单', path: '/admin/recharges', desc: '处理待审核订单与套餐配置。' },
  { title: '用量统计', path: '/admin/usage', desc: '观察请求趋势与模型消耗。' },
  { title: '图片任务', path: '/admin/image-tasks', desc: '查看最近图片任务与错误信息。' },
  { title: '系统设置', path: '/admin/settings', desc: '维护站点信息、邮件与支付参数。' },
]

function openPage(path: string) {
  router.push(path)
}

function taskStatusType(status: string): 'success' | 'danger' | 'warning' | 'info' | 'primary' {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'warning'
  if (status === 'queued' || status === 'dispatched') return 'info'
  return 'primary'
}

onMounted(loadDashboard)
</script>

<template>
  <div class="page-container admin-dashboard">
    <div class="card-block dashboard-hero" v-loading="loading">
      <div>
        <h2 class="page-title">后台概览</h2>
        <p class="dashboard-hero__desc">
          聚合用户、额度、请求与图片任务的最近状态，方便从一个入口快速查看全站运行概况。
        </p>
      </div>
      <el-button type="primary" @click="loadDashboard">
        <el-icon><Refresh /></el-icon> 刷新概览
      </el-button>
    </div>

    <div class="summary-grid">
      <el-card v-for="card in summaryCards" :key="card.title" shadow="never" class="summary-card">
        <div class="summary-card__title">{{ card.title }}</div>
        <div class="summary-card__value">{{ card.value }}</div>
        <div class="summary-card__detail">{{ card.detail }}</div>
      </el-card>
    </div>

    <div class="card-block">
      <div class="section-head">
        <div>
          <h3>近 7 天请求趋势</h3>
          <p>按日查看请求量与失败量，便于快速发现异常波动。</p>
        </div>
        <div class="section-head__meta">
          <span>请求 {{ overall?.requests ?? 0 }}</span>
          <span>失败 {{ overall?.failures ?? 0 }}</span>
          <span>图片 {{ overall?.image_images ?? 0 }}</span>
        </div>
      </div>

      <div class="bars">
        <div v-for="point in daily" :key="point.day" class="bar-cell">
          <div class="bar-wrap">
            <div class="bar bar-main" :style="{ height: `${(point.requests / maxDailyRequests) * 100}%` }" />
            <div
              v-if="point.failures"
              class="bar bar-fail"
              :style="{ height: `${(point.failures / maxDailyRequests) * 100}%` }"
            />
          </div>
          <div class="bar-value">{{ point.requests }}</div>
          <div class="bar-day">{{ point.day.slice(5) }}</div>
        </div>
        <el-empty v-if="daily.length === 0" description="最近 7 天暂无统计数据" />
      </div>
    </div>

    <div class="dashboard-columns">
      <div class="card-block">
        <div class="section-head">
          <div>
            <h3>Top 模型</h3>
            <p>近 7 天请求量最高的模型。</p>
          </div>
        </div>
        <el-table :data="topModels" stripe size="small" v-loading="loading">
          <el-table-column label="模型" min-width="180">
            <template #default="{ row }">
              <code>{{ row.model_slug || `#${row.model_id}` }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="90" />
          <el-table-column prop="requests" label="请求数" width="100" />
          <el-table-column prop="failures" label="失败" width="90" />
          <el-table-column label="扣费" width="140">
            <template #default="{ row }">{{ formatCredit(row.credit_cost) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="card-block">
        <div class="section-head">
          <div>
            <h3>Top 用户</h3>
            <p>近 7 天请求量最高的账号。</p>
          </div>
        </div>
        <el-table :data="topUsers" stripe size="small" v-loading="loading">
          <el-table-column prop="user_id" label="ID" width="80" />
          <el-table-column prop="email" label="邮箱" min-width="220" />
          <el-table-column prop="requests" label="请求数" width="100" />
          <el-table-column prop="failures" label="失败" width="90" />
          <el-table-column label="扣费" width="140">
            <template #default="{ row }">{{ formatCredit(row.credit_cost) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div class="card-block">
      <div class="section-head">
        <div>
          <h3>最近图片任务</h3>
          <p>展示最新 5 条任务记录，辅助查看排队与失败情况。</p>
        </div>
      </div>
      <el-table :data="recentImageTasks" stripe size="small" v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="user_email" label="用户" min-width="180" />
        <el-table-column prop="prompt" label="提示词" min-width="260" show-overflow-tooltip />
        <el-table-column prop="size" label="规格" width="110" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="taskStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="积分" width="120">
          <template #default="{ row }">{{ formatCredit(row.credit_cost) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div class="card-block">
      <div class="section-head">
        <div>
          <h3>快捷入口</h3>
          <p>常用后台页面保持就近访问。</p>
        </div>
      </div>

      <div class="quick-links">
        <button
          v-for="link in quickLinks"
          :key="link.path"
          class="quick-link"
          type="button"
          @click="openPage(link.path)"
        >
          <strong>{{ link.title }}</strong>
          <span>{{ link.desc }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.admin-dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.dashboard-hero__desc {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.8;
}

.summary-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.summary-card {
  border-radius: 14px;
  border: 1px solid var(--el-border-color-lighter);
}

.summary-card__title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.summary-card__value {
  margin-top: 10px;
  font-size: 26px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.summary-card__detail {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 15px;
  }

  p {
    margin: 6px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
}

.section-head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  min-height: 200px;
}

.bar-cell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.bar-wrap {
  position: relative;
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 160px;
}

.bar {
  min-height: 2px;
  border-radius: 6px 6px 0 0;
}

.bar-main {
  width: 60%;
  margin: 0 auto;
  background: linear-gradient(180deg, #409eff, #67c23a);
}

.bar-fail {
  position: absolute;
  left: 20%;
  right: 20%;
  bottom: 0;
  background: rgba(245, 108, 108, 0.72);
}

.bar-value {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.bar-day {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.dashboard-columns {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.quick-links {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.quick-link {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: border-color .2s ease, transform .2s ease;

  strong {
    font-size: 15px;
  }

  span {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.7;
    text-align: left;
  }
}

.quick-link:hover {
  transform: translateY(-2px);
  border-color: var(--el-color-primary-light-5);
}

code {
  background: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
}

@media (max-width: 960px) {
  .dashboard-columns {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .dashboard-hero,
  .section-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .bars {
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .bar-cell {
    min-width: 48px;
  }
}
</style>
