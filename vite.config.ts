import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const skipPrerender = process.env.SKIP_PRERENDER === "true";

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "app",
      ...(skipPrerender
        ? {}
        : {
            spa: {
              enabled: true,
              maskPath: "/mono",
              prerender: {
                outputPath: "/_shell",
                crawlLinks: false,
              },
            },
            prerender: {
              enabled: true,
              autoStaticPathsDiscovery: false,
              crawlLinks: false,
            },
            pages: [
              { path: "/" },
            ],
          }),
    }),
    viteReact(),
  ],
});
