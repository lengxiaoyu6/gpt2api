<script setup lang="ts">
const rows = [
  { name: 'gpt-image-2', price: '¥0.003' },
  { name: 'dalle-3-hd', price: '¥0.012' },
  { name: 'midjourney-v6', price: '¥0.019' },
  { name: 'stable-diffusion-xl', price: '¥0.005' },
  { name: 'flux-1-pro', price: '¥0.009' },
]

const highlights = [
  { title: '¥1 即可启用', desc: '超低充值门槛' },
  { title: '额度永久有效', desc: '无过期时间压力' },
  { title: '秒级订单同步', desc: '账单明细清晰透明' },
]
</script>

<template>
  <div class="pricing-page section-shell">
    <div class="pricing-head">
      <router-link to="/" class="back-link">返回首页</router-link>
      <h1>按次计费，实时透明</h1>
      <p>无需订阅，仅针对单次成功调用计费，适合测试、集成与长期使用。</p>
    </div>

    <section class="pricing-card">
      <div class="pricing-card__head">
        <div>
          <h2>模型计费详情</h2>
          <p>价格基于每 1 次成功请求计算</p>
        </div>
        <router-link to="/register" class="pricing-cta">立即充值开启</router-link>
      </div>

      <div class="pricing-table">
        <table>
          <thead>
            <tr>
              <th>支持模型</th>
              <th>单次请求价格</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.name">
              <td>{{ row.name }}</td>
              <td>{{ row.price }}</td>
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
  width: min(1080px, calc(100vw - 32px));
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
    border-collapse: collapse;
  }

  th,
  td {
    padding: 22px 30px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    text-align: left;
    font-size: 14px;
  }

  th {
    color: rgba(226, 232, 240, 0.56);
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  td:last-child,
  th:last-child {
    text-align: right;
  }

  td:first-child {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
    color: rgba(248, 250, 252, 0.9);
  }

  td:last-child {
    font-weight: 700;
    color: #ffffff;
  }
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
    width: min(1080px, calc(100vw - 24px));
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
