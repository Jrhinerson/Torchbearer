import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const python = path.join(
  root,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
)
const backendPort = process.env.TORCHBEARER_TEST_BACKEND_PORT ?? '8001'
const frontendPort = process.env.TORCHBEARER_TEST_FRONTEND_PORT ?? '5174'
const testEnvironment = {
  TORCHBEARER_TEST_BACKEND_PORT: backendPort,
  TORCHBEARER_TEST_FRONTEND_PORT: frontendPort,
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  outputDir: '../test-results',
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `"${python}" "${path.join(root, 'scripts/test_server.py')}"`,
      url: `http://127.0.0.1:${backendPort}/api/v1/health/`,
      env: testEnvironment,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `npm run dev -- --port ${frontendPort}`,
      url: `http://127.0.0.1:${frontendPort}`,
      env: testEnvironment,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
})
