<script setup lang="ts">
defineProps<{
  siteFooter?: string
}>()
</script>

<template>
  <div class="auth-shell">
    <div class="auth-shell__glow auth-shell__glow--blue" />
    <div class="auth-shell__glow auth-shell__glow--cyan" />
    <div class="auth-shell__container">
      <aside class="auth-shell__hero">
        <slot name="hero" />
      </aside>
      <section class="auth-shell__form">
        <slot />
        <p v-if="siteFooter" class="auth-shell__site-footer">{{ siteFooter }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.auth-shell {
  position: relative;
  min-height: calc(100vh - 40px);
  padding: 32px 24px 8px;
  overflow: hidden;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.18), transparent 34%),
    radial-gradient(circle at bottom right, rgba(34, 199, 242, 0.16), transparent 28%),
    linear-gradient(145deg, #020617 0%, #0f172a 52%, #111827 100%);
}

.auth-shell__glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(24px);
  pointer-events: none;
  opacity: 0.85;
}

.auth-shell__glow--blue {
  top: 72px;
  left: -72px;
  width: 240px;
  height: 240px;
  background: rgba(59, 130, 246, 0.24);
}

.auth-shell__glow--cyan {
  right: -96px;
  bottom: 32px;
  width: 280px;
  height: 280px;
  background: rgba(34, 199, 242, 0.18);
}

.auth-shell__container {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(340px, 420px);
  align-items: center;
  gap: 40px;
  max-width: 1200px;
  min-height: 100%;
  margin: 0 auto;
}

.auth-shell__hero,
.auth-shell__form {
  min-width: 0;
}

.auth-shell__form {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
}

.auth-shell__site-footer {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(148, 163, 184, 0.92);
  text-align: center;
}

@media (max-width: 960px) {
  .auth-shell {
    padding-inline: 20px;
  }

  .auth-shell__container {
    grid-template-columns: 1fr;
    gap: 24px;
    max-width: 720px;
  }
}

@media (max-width: 640px) {
  .auth-shell {
    padding: 20px 16px 8px;
  }

  .auth-shell__container {
    gap: 18px;
  }
}
</style>
