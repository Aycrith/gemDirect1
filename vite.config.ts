import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Proxy for LM Studio LLM API (fixes CORS issue)
          ...(env.VITE_LOCAL_STORY_PROVIDER_URL
            ? {
                '/api/local-llm': {
                  target: env.VITE_LOCAL_STORY_PROVIDER_URL.replace('/v1/chat/completions', ''),
                  changeOrigin: true,
                  rewrite: (path) => path.replace(/^\/api\/local-llm/, '/v1/chat/completions'),
                  configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq) => {
                      proxyReq.setHeader('Content-Type', 'application/json');
                    });
                  },
                },
                // Proxy for LM Studio models endpoint (Settings Modal test connection)
                '/api/local-llm-models': {
                  target: env.VITE_LOCAL_STORY_PROVIDER_URL.replace('/v1/chat/completions', ''),
                  changeOrigin: true,
                  rewrite: (path) => path.replace(/^\/api\/local-llm-models/, '/v1/models'),
                  configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq) => {
                      proxyReq.setHeader('Content-Type', 'application/json');
                    });
                  },
                },
              }
            : {}),
          // Proxy for ComfyUI system_stats endpoint (Settings Modal test connection)
          '/api/comfyui-test': {
            target: 'http://127.0.0.1:8188',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/comfyui-test/, '/system_stats'),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('Content-Type', 'application/json');
              });
            },
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // P0 Optimization: Bundle optimization for better cold start performance
        // Target: Reduce 766KB main chunk, improve -0.8s cold start
        rollupOptions: {
          output: {
            manualChunks: {
              // Vendor chunk: React and core dependencies
              'vendor-react': ['react', 'react-dom', 'react/jsx-runtime'],
              // ComfyUI services chunk: Large service files
              'comfyui-services': [
                './services/comfyUIService.ts',
                './services/comfyUICallbackService.ts',
                './services/payloadService.ts'
              ],
              // Gemini services chunk: AI generation services
              'gemini-services': [
                './services/geminiService.ts',
                './services/planExpansionService.ts',
                './services/localStoryService.ts'
              ],
              // Utils chunk: Shared utilities
              'utils': [
                './utils/hooks.ts',
                './utils/database.ts',
                './utils/projectUtils.ts'
              ]
            },
            // Improve chunk names for better caching
            chunkFileNames: 'assets/[name]-[hash].js',
            entryFileNames: 'assets/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash].[ext]'
          }
        },
        // Set chunk size warning limit to 500KB (current: 766KB)
        chunkSizeWarningLimit: 500,
        // Enable minification
        minify: 'esbuild',
        // Source maps for production debugging
        sourcemap: true
      }
    };
});
