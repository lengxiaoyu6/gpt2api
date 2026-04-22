<script setup lang="ts">
withDefaults(
  defineProps<{
    siteName: string
    siteDesc: string
    siteLogo?: string
    allowRegister: boolean
  }>(),
  {
    siteLogo: '',
  },
)

const capabilities = [
  {
    title: '文生图',
    detail: '输入 prompt，快速生成海报、封面、商品草图与创意首版图像。',
    meta: 'model · prompt · size · n',
  },
  {
    title: '图生图',
    detail: '支持参考图输入与二次生成，适合风格延展、细节调整与视觉重绘。',
    meta: 'reference_images · prompt · size',
  },
  {
    title: '批量生成',
    detail: '支持多张输出、尺寸切换与模型切换，适合脚本任务与批处理调用。',
    meta: 'n · size · automation',
  },
]
</script>

<template>
  <div class="auth-hero">
    <div class="auth-hero__brand">
      <img v-if="siteLogo" :src="siteLogo" class="auth-hero__logo" alt="logo" />
      <div v-else class="auth-hero__mark">{{ (siteName[0] || 'G').toUpperCase() }}</div>
      <div class="auth-hero__brand-copy">
        <div class="auth-hero__badges">
          <span>GPT-image API</span>
          <span>OpenAI Images Compatible</span>
        </div>
        <h1>{{ siteName }}</h1>
        <p>{{ siteDesc }}</p>
      </div>
    </div>

    <div class="auth-hero__headline">
      <p class="auth-hero__eyebrow">图像生成 API 控制台</p>
      <h2>统一接入 GPT-image 能力</h2>
      <p>
        适合开发调试、个人项目与小规模业务接入，支持文生图、图生图、批量生成。
      </p>
    </div>

    <div class="auth-hero__cards">
      <article v-for="item in capabilities" :key="item.title" class="auth-hero__card">
        <h3>{{ item.title }}</h3>
        <p>{{ item.detail }}</p>
        <code>{{ item.meta }}</code>
      </article>
    </div>

    <div class="auth-hero__spec">
      <div class="auth-hero__spec-head">
        <span class="auth-hero__spec-label">接口形态</span>
        <code>POST /v1/images/generations</code>
      </div>
      <div class="auth-hero__spec-lines">
        <div><span>Authorization</span><code>Bearer API_KEY</code></div>
        <div><span>Fields</span><code>model, prompt, size, n, reference_images</code></div>
      </div>
    </div>

    <div class="auth-hero__notes">
      <span>登录后查看密钥、额度与调用记录</span>
      <span>支持 OpenAI Images 接口风格</span>
      <span v-if="allowRegister">新账号可领取体验额度</span>
      <span v-else>邀请开通后即可登录控制台使用</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.auth-hero {
  color: #e2e8f0;
}

.auth-hero__brand {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.auth-hero__logo,
.auth-hero__mark {
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  border-radius: 16px;
}

.auth-hero__logo {
  object-fit: contain;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.28);
}

.auth-hero__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: #eff6ff;
  background: linear-gradient(135deg, #2563eb, #22c7f2 55%, #8b5cf6);
  box-shadow: 0 14px 36px rgba(37, 99, 235, 0.34);
}

.auth-hero__brand-copy {
  min-width: 0;
}

.auth-hero__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;

  span {
    padding: 6px 10px;
    border: 1px solid rgba(96, 165, 250, 0.3);
    border-radius: 999px;
    font-size: 12px;
    line-height: 1;
    color: #bfdbfe;
    background: rgba(15, 23, 42, 0.46);
  }
}

.auth-hero__brand-copy h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.15;
  color: #f8fafc;
}

.auth-hero__brand-copy p {
  margin: 10px 0 0;
  max-width: 640px;
  font-size: 14px;
  line-height: 1.7;
  color: #94a3b8;
}

.auth-hero__headline {
  margin-top: 28px;
}

.auth-hero__eyebrow {
  margin: 0 0 10px;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #60a5fa;
}

.auth-hero__headline h2 {
  margin: 0;
  font-size: 42px;
  line-height: 1.08;
  color: #f8fafc;
}

.auth-hero__headline > p:last-child {
  margin: 14px 0 0;
  max-width: 680px;
  font-size: 16px;
  line-height: 1.8;
  color: #cbd5e1;
}

.auth-hero__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 28px;
}

.auth-hero__card {
  padding: 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.76), rgba(15, 23, 42, 0.48));
  box-shadow: 0 22px 60px rgba(2, 6, 23, 0.24);
  transition: transform 0.2s ease, border-color 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(96, 165, 250, 0.36);
  }

  h3 {
    margin: 0;
    font-size: 17px;
    color: #f8fafc;
  }

  p {
    margin: 10px 0 14px;
    font-size: 13px;
    line-height: 1.7;
    color: #94a3b8;
  }

  code {
    display: inline-flex;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    color: #93c5fd;
    background: rgba(30, 41, 59, 0.92);
    font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  }
}

.auth-hero__spec {
  margin-top: 22px;
  padding: 18px 20px;
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.62);
}

.auth-hero__spec-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;

  code {
    font-size: 14px;
    color: #f8fafc;
    font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  }
}

.auth-hero__spec-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.14);
  color: #93c5fd;
  font-size: 12px;
}

.auth-hero__spec-lines {
  margin-top: 12px;
  display: grid;
  gap: 10px;

  div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(2, 6, 23, 0.34);
    font-size: 13px;
    color: #cbd5e1;
  }

  code {
    color: #bfdbfe;
    font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  }
}

.auth-hero__notes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;

  span {
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.55);
    color: #cbd5e1;
    font-size: 13px;
    border: 1px solid rgba(148, 163, 184, 0.14);
  }
}

@media (max-width: 960px) {
  .auth-hero__headline h2 {
    font-size: 34px;
  }

  .auth-hero__cards {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .auth-hero__brand {
    gap: 12px;
  }

  .auth-hero__logo,
  .auth-hero__mark {
    width: 48px;
    height: 48px;
    border-radius: 14px;
  }

  .auth-hero__brand-copy h1 {
    font-size: 22px;
  }

  .auth-hero__headline {
    margin-top: 20px;
  }

  .auth-hero__headline h2 {
    font-size: 28px;
  }

  .auth-hero__headline > p:last-child {
    font-size: 14px;
  }

  .auth-hero__notes {
    gap: 8px;

    span {
      font-size: 12px;
    }
  }
}
</style>
