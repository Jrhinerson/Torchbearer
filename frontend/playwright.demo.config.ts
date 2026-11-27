import { defineConfig } from '@playwright/test'
import config from './playwright.config'

const servers = config.webServer as { command: string }[]
export default defineConfig({
  ...config,
  testMatch: '**/populated-demo.spec.ts',
  testIgnore: [],
  outputDir: '../test-results-demo',
  webServer: [
    {
      ...servers[0],
      command:
        servers[0].command.replace('test_server.py', 'demo.py') +
        ' --backend-only',
    },
    servers[1],
  ],
})
