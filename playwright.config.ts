import { defineConfig } from "@playwright/test";

const port = 3000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node demo-app/server.js",
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
