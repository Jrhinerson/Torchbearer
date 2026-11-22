import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const python = path.join(
  root,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
)
const apiPort = 18000
const webPort = 15173
const apiURL = `http://127.0.0.1:${apiPort}`
const baseURL = `http://127.0.0.1:${webPort}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  outputDir: '../test-results',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `"${python}" "${path.join(root, 'scripts/test_server.py')}"`,
      url: `${apiURL}/api/v1/health/`,
      env: {
        TORCHBEARER_TEST_API_PORT: String(apiPort),
        TORCHBEARER_TEST_WEB_ORIGIN: baseURL,
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `npm run dev -- --port ${webPort}`,
      url: baseURL,
      env: { TORCHBEARER_API_PROXY: apiURL },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
})
