<script setup lang="ts">
const tabs = ['All', 'DALL-E 3', 'Midjourney', 'SDXL']
const images = [
  {
    url: 'https://images.unsplash.com/photo-1678382156212-f1593460514a?w=800',
    model: 'DALL-E 3',
    title: '未来实验室',
  },
  {
    url: 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800',
    model: 'MJ v6',
    title: '流体几何',
  },
  {
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    model: 'DALL-E 3',
    title: '极简抽象',
  },
  {
    url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800',
    model: 'Stable Cascade',
    title: '数字脉冲',
  },
  {
    url: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=800',
    model: 'DALL-E 3',
    title: '光影矩阵',
  },
  {
    url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800',
    model: 'MJ v6',
    title: '波段景观',
  },
]
</script>

<template>
  <div class="showcase-page section-shell">
    <div class="showcase-head">
      <div>
        <router-link to="/" class="back-link">返回首页</router-link>
        <h1>案例展示库</h1>
        <p>通过稳定下发的创作结果展示不同模型风格与画面表现形式。</p>
      </div>

      <div class="showcase-tabs">
        <span v-for="tab in tabs" :key="tab">{{ tab }}</span>
      </div>
    </div>

    <div class="showcase-grid">
      <article v-for="item in images" :key="item.url" class="showcase-card">
        <img :src="item.url" :alt="item.title" referrerpolicy="no-referrer" />
        <div class="showcase-card__overlay">
          <small>{{ item.model }}</small>
          <h2>{{ item.title }}</h2>
          <button type="button">查看请求 Prompt</button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped lang="scss">
.section-shell {
  width: min(1200px, calc(100vw - 32px));
  margin: 0 auto;
}

.showcase-page {
  padding: 72px 0 88px;
}

.back-link {
  display: inline-flex;
  margin-bottom: 20px;
  color: rgba(226, 232, 240, 0.7);
  text-decoration: none;
  font-size: 14px;
}

.showcase-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  h1 {
    margin: 0;
    font-size: clamp(42px, 6vw, 72px);
    font-style: italic;
    letter-spacing: -0.04em;
  }

  p {
    max-width: 560px;
    margin: 16px 0 0;
    font-size: 16px;
    line-height: 1.8;
    color: rgba(226, 232, 240, 0.66);
  }
}

.showcase-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;

  span {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    color: rgba(226, 232, 240, 0.72);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
}

.showcase-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
  margin-top: 36px;
}

.showcase-card {
  position: relative;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.03);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.6s ease;
  }

  &:hover img {
    transform: scale(1.08);
  }
}

.showcase-card__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 26px;
  background: linear-gradient(180deg, transparent 28%, rgba(0, 0, 0, 0.82));

  small {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #60a5fa;
  }

  h2 {
    margin: 10px 0 16px;
    font-size: 24px;
  }

  button {
    min-height: 42px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
}

@media (max-width: 960px) {
  .showcase-head,
  .showcase-grid {
    grid-template-columns: 1fr;
  }

  .showcase-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .showcase-tabs {
    justify-content: flex-start;
  }

  .showcase-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .section-shell {
    width: min(1200px, calc(100vw - 24px));
  }

  .showcase-page {
    padding: 56px 0 72px;
  }

  .showcase-grid {
    grid-template-columns: 1fr;
  }
}
</style>
