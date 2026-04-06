import { defineConfig, loadEnv } from "vite";

import { handleNotionProjectsNodeRequest } from "./server/notion-projects-handler.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
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
