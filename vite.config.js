import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { handleNotionProjectsNodeRequest } from "./server/notion-projects-handler.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        includeAssets: [
          "favicon.svg",
          "pwa-icon.svg",
          "pwa-192.png",
          "pwa-512.png",
          "pwa-512-maskable.png",
        ],
        manifest: {
          name: "Taskion",
          short_name: "Taskion",
          description:
            "Tasks, projects, and Pomodoro — synced with Notion and Supabase.",
          theme_color: "#ffffff",
          background_color: "#ffffff",
          display: "standalone",
          orientation: "portrait-primary",
          scope: "/",
          start_url: "/",
          icons: [
            {
              src: "pwa-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "pwa-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "pwa-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/__server\//],
        },
        devOptions: {
          enabled: true,
        },
      }),
      {
        name: "notion-projects-dev-api",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const requestPath = req.url?.split("?")[0];

            if (requestPath !== "/__server/notion-projects") {
              next();
              return;
            }

            await handleNotionProjectsNodeRequest(req, res, env);
          });
        },
      },
    ],
  };
});
