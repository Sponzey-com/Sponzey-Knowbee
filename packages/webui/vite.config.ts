import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

const knowbeeMdBrowserShim = fileURLToPath(new URL("./src/shims/knowbee-md-browser.ts", import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: "/",
  resolve: {
    alias: [
      {
        find: "../memory/knowbee-md.js",
        replacement: knowbeeMdBrowserShim,
      },
      {
        find: "./knowbee-md.js",
        replacement: knowbeeMdBrowserShim,
      },
      {
        find: /.*core\/src\/memory\/knowbee-md\.js$/,
        replacement: knowbeeMdBrowserShim,
      },
    ],
  },
  server: {
    port: Number(process.env.KNOWBEE_WEBUI_PORT ?? 4220),
    strictPort: true,
    proxy: {
      "/api": "http://localhost:18888",
      "/ws": { target: "ws://localhost:18888", ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
