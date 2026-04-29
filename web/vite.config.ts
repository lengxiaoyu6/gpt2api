import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

const normalizeModuleId = (id: string) => id.replace(/\\/g, '/');

const isNodeModulePackage = (id: string, packageName: string) => id.includes(`/node_modules/${packageName}/`);

const isAnyNodeModulePackage = (id: string, packageNames: readonly string[]) =>
  packageNames.some((packageName) => isNodeModulePackage(id, packageName));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/p/': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = normalizeModuleId(id);
            if (!normalizedId.includes('node_modules')) return;

            if (
              isAnyNodeModulePackage(normalizedId, [
                'react',
                'react-dom',
                'scheduler',
                'use-sync-external-store',
              ])
            ) {
              return 'react-vendor';
            }

            if (
              isAnyNodeModulePackage(normalizedId, [
                'motion',
                'framer-motion',
                'motion-dom',
                'motion-utils',
                'tslib',
              ])
            ) {
              return 'motion-vendor';
            }

            if (
              isAnyNodeModulePackage(normalizedId, [
                '@base-ui/react',
                '@base-ui/utils',
                '@floating-ui/react-dom',
                '@floating-ui/utils',
                '@babel/runtime',
                'lucide-react',
                'sonner',
                'class-variance-authority',
                'clsx',
                'tailwind-merge',
              ])
            ) {
              return 'ui-vendor';
            }

            if (
              isAnyNodeModulePackage(normalizedId, [
                'axios',
                'zustand',
                '@google/genai',
              ])
            ) {
              return 'api-vendor';
            }

            return;
          },
        },
      },
    },
  };
});
