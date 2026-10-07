// vite.config.ts
import { defineConfig } from "file:///C:/Users/Gotrans/3D%20Objects/OneDrive/perfil/Gotrans/Desktop/RIG-OTAVIO/rig-claude/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.43_terser@5.51.2/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Gotrans/3D%20Objects/OneDrive/perfil/Gotrans/Desktop/RIG-OTAVIO/rig-claude/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@20.19.43_terser@5.51.2_/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///C:/Users/Gotrans/3D%20Objects/OneDrive/perfil/Gotrans/Desktop/RIG-OTAVIO/rig-claude/node_modules/.pnpm/vite-plugin-pwa@0.20.5_vite@5.4.21_@types+node@20.19.43_terser@5.51.2__workbox-build@7.4.1_@t_k2skdbrenyxmmmiosk3f2lbrca/node_modules/vite-plugin-pwa/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "Rigabras - Gest\xE3o Log\xEDstica",
        short_name: "Rigabras TMS",
        description: "Ecossistema Integrado de Gest\xE3o Log\xEDstica (TMS + WMS) - Rigabras Transportes",
        theme_color: "#f8fafc",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/v1"),
            handler: "NetworkFirst",
            options: {
              cacheName: "rigabras-api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }
            }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // Só o framer-motion (usado em todo o app) ganha chunk próprio. `three`/r3f ficam de fora de
        // propósito: declará-los em manualChunks arrastava helpers compartilhados para o chunk 3D e o
        // index.html passava a pré-carregar ~1,2 MB de WebGL até na tela de login.
        manualChunks: {
          motion: ["framer-motion"]
        }
      }
    }
  },
  // `host: '127.0.0.1'` (em vez do padrão do Vite, que só faz bind em `::1`
  // nesta máquina Windows): sem isso, qualquer cliente que resolva
  // `localhost`/`127.0.0.1` para IPv4 primeiro (curl neste sandbox,
  // Playwright/Chromium) recebia "connection refused" mesmo com o dev
  // server rodando — encontrado ao tentar acessar a app pela primeira vez
  // nesta sessão de testes.
  server: { port: 5173, host: "127.0.0.1" },
  preview: { port: 5173, host: "127.0.0.1" }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxHb3RyYW5zXFxcXDNEIE9iamVjdHNcXFxcT25lRHJpdmVcXFxccGVyZmlsXFxcXEdvdHJhbnNcXFxcRGVza3RvcFxcXFxSSUctT1RBVklPXFxcXHJpZy1jbGF1ZGVcXFxcYXBwc1xcXFx3ZWJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXEdvdHJhbnNcXFxcM0QgT2JqZWN0c1xcXFxPbmVEcml2ZVxcXFxwZXJmaWxcXFxcR290cmFuc1xcXFxEZXNrdG9wXFxcXFJJRy1PVEFWSU9cXFxccmlnLWNsYXVkZVxcXFxhcHBzXFxcXHdlYlxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvR290cmFucy8zRCUyME9iamVjdHMvT25lRHJpdmUvcGVyZmlsL0dvdHJhbnMvRGVza3RvcC9SSUctT1RBVklPL3JpZy1jbGF1ZGUvYXBwcy93ZWIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcclxuaW1wb3J0IHsgVml0ZVBXQSB9IGZyb20gJ3ZpdGUtcGx1Z2luLXB3YSc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtcclxuICAgIHJlYWN0KCksXHJcbiAgICBWaXRlUFdBKHtcclxuICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsXHJcbiAgICAgIGluY2x1ZGVBc3NldHM6IFsnZmF2aWNvbi5pY28nXSxcclxuICAgICAgbWFuaWZlc3Q6IHtcclxuICAgICAgICBuYW1lOiAnUmlnYWJyYXMgLSBHZXN0XHUwMEUzbyBMb2dcdTAwRURzdGljYScsXHJcbiAgICAgICAgc2hvcnRfbmFtZTogJ1JpZ2FicmFzIFRNUycsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdFY29zc2lzdGVtYSBJbnRlZ3JhZG8gZGUgR2VzdFx1MDBFM28gTG9nXHUwMEVEc3RpY2EgKFRNUyArIFdNUykgLSBSaWdhYnJhcyBUcmFuc3BvcnRlcycsXHJcbiAgICAgICAgdGhlbWVfY29sb3I6ICcjZjhmYWZjJyxcclxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnI2Y4ZmFmYycsXHJcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxyXG4gICAgICAgIHN0YXJ0X3VybDogJy8nLFxyXG4gICAgICAgIGljb25zOiBbXHJcbiAgICAgICAgICB7IHNyYzogJ3B3YS0xOTJ4MTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicsIHR5cGU6ICdpbWFnZS9wbmcnIH0sXHJcbiAgICAgICAgICB7IHNyYzogJ3B3YS01MTJ4NTEyLnBuZycsIHNpemVzOiAnNTEyeDUxMicsIHR5cGU6ICdpbWFnZS9wbmcnIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSxcclxuICAgICAgd29ya2JveDoge1xyXG4gICAgICAgIHNraXBXYWl0aW5nOiB0cnVlLFxyXG4gICAgICAgIGNsaWVudHNDbGFpbTogdHJ1ZSxcclxuICAgICAgICBjbGVhbnVwT3V0ZGF0ZWRDYWNoZXM6IHRydWUsXHJcbiAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDYgKiAxMDI0ICogMTAyNCxcclxuICAgICAgICBnbG9iUGF0dGVybnM6IFsnKiovKi57anMsY3NzLGh0bWwsaWNvLHBuZyxzdmd9J10sXHJcbiAgICAgICAgcnVudGltZUNhY2hpbmc6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsIH0pID0+IHVybC5wYXRobmFtZS5zdGFydHNXaXRoKCcvYXBpL3YxJyksXHJcbiAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAncmlnYWJyYXMtYXBpLWNhY2hlJyxcclxuICAgICAgICAgICAgICBuZXR3b3JrVGltZW91dFNlY29uZHM6IDUsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAyMDAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgXSxcclxuICBidWlsZDoge1xyXG4gICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICBvdXRwdXQ6IHtcclxuICAgICAgICAvLyBTXHUwMEYzIG8gZnJhbWVyLW1vdGlvbiAodXNhZG8gZW0gdG9kbyBvIGFwcCkgZ2FuaGEgY2h1bmsgcHJcdTAwRjNwcmlvLiBgdGhyZWVgL3IzZiBmaWNhbSBkZSBmb3JhIGRlXHJcbiAgICAgICAgLy8gcHJvcFx1MDBGM3NpdG86IGRlY2xhclx1MDBFMS1sb3MgZW0gbWFudWFsQ2h1bmtzIGFycmFzdGF2YSBoZWxwZXJzIGNvbXBhcnRpbGhhZG9zIHBhcmEgbyBjaHVuayAzRCBlIG9cclxuICAgICAgICAvLyBpbmRleC5odG1sIHBhc3NhdmEgYSBwclx1MDBFOS1jYXJyZWdhciB+MSwyIE1CIGRlIFdlYkdMIGF0XHUwMEU5IG5hIHRlbGEgZGUgbG9naW4uXHJcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB7XHJcbiAgICAgICAgICBtb3Rpb246IFsnZnJhbWVyLW1vdGlvbiddLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgLy8gYGhvc3Q6ICcxMjcuMC4wLjEnYCAoZW0gdmV6IGRvIHBhZHJcdTAwRTNvIGRvIFZpdGUsIHF1ZSBzXHUwMEYzIGZheiBiaW5kIGVtIGA6OjFgXHJcbiAgLy8gbmVzdGEgbVx1MDBFMXF1aW5hIFdpbmRvd3MpOiBzZW0gaXNzbywgcXVhbHF1ZXIgY2xpZW50ZSBxdWUgcmVzb2x2YVxyXG4gIC8vIGBsb2NhbGhvc3RgL2AxMjcuMC4wLjFgIHBhcmEgSVB2NCBwcmltZWlybyAoY3VybCBuZXN0ZSBzYW5kYm94LFxyXG4gIC8vIFBsYXl3cmlnaHQvQ2hyb21pdW0pIHJlY2ViaWEgXCJjb25uZWN0aW9uIHJlZnVzZWRcIiBtZXNtbyBjb20gbyBkZXZcclxuICAvLyBzZXJ2ZXIgcm9kYW5kbyBcdTIwMTQgZW5jb250cmFkbyBhbyB0ZW50YXIgYWNlc3NhciBhIGFwcCBwZWxhIHByaW1laXJhIHZlelxyXG4gIC8vIG5lc3RhIHNlc3NcdTAwRTNvIGRlIHRlc3Rlcy5cclxuICBzZXJ2ZXI6IHsgcG9ydDogNTE3MywgaG9zdDogJzEyNy4wLjAuMScgfSxcclxuICBwcmV2aWV3OiB7IHBvcnQ6IDUxNzMsIGhvc3Q6ICcxMjcuMC4wLjEnIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTBkLFNBQVMsb0JBQW9CO0FBQ3ZmLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFFeEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsZUFBZSxDQUFDLGFBQWE7QUFBQSxNQUM3QixVQUFVO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixrQkFBa0I7QUFBQSxRQUNsQixTQUFTO0FBQUEsUUFDVCxXQUFXO0FBQUEsUUFDWCxPQUFPO0FBQUEsVUFDTCxFQUFFLEtBQUssbUJBQW1CLE9BQU8sV0FBVyxNQUFNLFlBQVk7QUFBQSxVQUM5RCxFQUFFLEtBQUssbUJBQW1CLE9BQU8sV0FBVyxNQUFNLFlBQVk7QUFBQSxRQUNoRTtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNQLGFBQWE7QUFBQSxRQUNiLGNBQWM7QUFBQSxRQUNkLHVCQUF1QjtBQUFBLFFBQ3ZCLCtCQUErQixJQUFJLE9BQU87QUFBQSxRQUMxQyxjQUFjLENBQUMsZ0NBQWdDO0FBQUEsUUFDL0MsZ0JBQWdCO0FBQUEsVUFDZDtBQUFBLFlBQ0UsWUFBWSxDQUFDLEVBQUUsSUFBSSxNQUFNLElBQUksU0FBUyxXQUFXLFNBQVM7QUFBQSxZQUMxRCxTQUFTO0FBQUEsWUFDVCxTQUFTO0FBQUEsY0FDUCxXQUFXO0FBQUEsY0FDWCx1QkFBdUI7QUFBQSxjQUN2QixZQUFZLEVBQUUsWUFBWSxLQUFLLGVBQWUsS0FBSyxLQUFLLEdBQUc7QUFBQSxZQUM3RDtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQUlOLGNBQWM7QUFBQSxVQUNaLFFBQVEsQ0FBQyxlQUFlO0FBQUEsUUFDMUI7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLFFBQVEsRUFBRSxNQUFNLE1BQU0sTUFBTSxZQUFZO0FBQUEsRUFDeEMsU0FBUyxFQUFFLE1BQU0sTUFBTSxNQUFNLFlBQVk7QUFDM0MsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
