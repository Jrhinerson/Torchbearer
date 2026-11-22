import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const timestamp = '2026-11-22T12:00:00Z'
const run = {
  id: 'a23857dd-a101-402c-a570-2bc14c3ad44d',
  stage: 'plan',
  agent: 'codex',
  state: 'blocked',
  sequence: 1,
  error: 'Let’s shape the plan',
  cancel_requested: false,
  result: {
    outcome: 'blocked',
    summary: 'Let’s shape the plan',
    details: [
      '## Agreed behavior',
      '- **Keep the current filters.**',
      '- Add an empty state in `FolderSearch.tsx`.',
      'Read the [reference](https://example.com/docs).',
      '```typescript\nconst longExample = "' + 'example'.repeat(55) + '"\n```',
      '| Area | Decision |\n| --- | --- |\n| Frontend | Show an empty state |',
      '![Reference image](https://example.com/pixel.png)',
      '<script>window.untrustedPlanningReply = true</script>',
      '[Unsafe link](javascript:alert(1))',
      ...Array.from(
        { length: 14 },
        (_, index) =>
          `### Planning note ${index + 1}\n\nDiscuss the behavior before approving implementation.`,
      ),
    ].join('\n\n'),
    tests: [],
  },
  log: 'Captured planning output',
  feedback: '',
  cli_version: 'Fixture CLI',
  review_fingerprint: '',
  created_at: timestamp,
  started_at: timestamp,
  finished_at: timestamp,
}
const task = {
  id: '491ad097-54fa-4ab9-8348-12f63f8901df',
  title: 'Refine folder search',
  description: 'Discuss the empty state and filters.',
  project: {
    id: '6fd2f762-b7d4-4e3c-aa44-b5fd410edfd6',
    name: 'Torchbearer',
    path: 'C:/fixtures/torchbearer',
    archived: false,
    created_at: timestamp,
    updated_at: timestamp,
  },
  repository: null,
  routing_mode: 'frontier',
  frontier_agent: 'codex',
  stage_agents: {
    plan: 'codex',
    integrate: 'codex',
    test: 'codex',
    code_review: 'codex',
  },
  next_stage: 'integrate',
  status: 'plan',
  revision: 2,
  completed_at: null,
  latest_run: run,
  workspace_path: '',
  branch: '',
  base_commit: '',
  created_at: timestamp,
  updated_at: timestamp,
}

async function openPlanning(page: Page, theme: string) {
  await page.route('**/api/v1/tasks/', (route) =>
    route.fulfill({ json: [task] }),
  )
  await page.route(`**/api/v1/tasks/${task.id}/runs/`, (route) =>
    route.fulfill({ json: { runs: [run], decisions: [] } }),
  )
  await page.goto('/')
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value
  }, theme)
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme)
  await page
    .getByRole('button', { name: `Open ${task.title}`, exact: true })
    .click()
  return page.getByRole('dialog', { name: task.title, exact: true })
}

for (const width of [1280, 390, 320]) {
  for (const theme of ['dark', 'light']) {
    test(`T3 chat layout keeps the composer anchored at ${width}px in ${theme} theme`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 })
      const imageRequests: string[] = []
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('request', (request) => {
        if (request.url().includes('example.com/pixel'))
          imageRequests.push(request.url())
      })
      const dialog = await openPlanning(page, theme)
      const thread = dialog.getByRole('list', { name: 'Planning conversation' })
      const message = dialog.getByLabel('Message your planning agent')
      const send = dialog.getByRole('button', {
        name: 'Send message',
        exact: true,
      })
      await expect(
        thread.getByRole('heading', { name: 'Agreed behavior' }),
      ).toHaveCount(1)
      await expect(thread.locator('strong')).toHaveText(
        'Keep the current filters.',
      )
      await expect(thread.locator('pre code')).toContainText(
        'const longExample',
      )
      await expect(thread.getByRole('table')).toHaveCount(1)
      await expect(
        thread.getByRole('link', { name: 'reference', exact: true }),
      ).toHaveAttribute('target', '_blank')
      await expect(
        thread.locator('script, img, a[href^="javascript:"]'),
      ).toHaveCount(0)
      expect(imageRequests).toEqual([])
      const initialComposer = await dialog
        .locator('.planning-composer')
        .boundingBox()
      expect(initialComposer).not.toBeNull()
      await thread.evaluate((element) => {
        element.scrollTop = 0
      })
      await expect(
        dialog.getByRole('button', { name: 'Jump to latest' }),
      ).toBeVisible()
      const scrolledComposer = await dialog
        .locator('.planning-composer')
        .boundingBox()
      expect(Math.abs(scrolledComposer!.y - initialComposer!.y)).toBeLessThan(2)
      await dialog.getByRole('button', { name: 'Jump to latest' }).click()
      await expect(
        dialog.getByRole('button', { name: 'Jump to latest' }),
      ).toHaveCount(0)
      const initialHeight = await message.evaluate(
        (element) => element.clientHeight,
      )
      expect(initialHeight).toBeLessThan(100)
      await message.fill(
        Array.from(
          { length: 12 },
          () => 'Discuss another planning detail.',
        ).join('\n'),
      )
      const expandedHeight = await message.evaluate(
        (element) => element.clientHeight,
      )
      expect(expandedHeight).toBeGreaterThan(initialHeight)
      expect(expandedHeight).toBeLessThanOrEqual(188)
      await expect(send).toBeInViewport()
      await message.fill('One question.')
      await expect
        .poll(() => message.evaluate((element) => element.clientHeight))
        .toBe(initialHeight)
      await expect(send).toBeEnabled()
      const bounds = await dialog.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(false)
      if (width === 1280) {
        await message.fill(
          'Refine the project picker and keep the keyboard controls accessible. '.repeat(
            3,
          ),
        )
        const wideHeight = await message.evaluate(
          (element) => element.clientHeight,
        )
        await page.setViewportSize({ width: 320, height: 850 })
        await expect
          .poll(() => message.evaluate((element) => element.clientHeight))
          .toBeGreaterThan(wideHeight)
        await expect(send).toBeInViewport()
      }
      await dialog.getByRole('button', { name: 'Close task review' }).click()
      await expect(
        page.getByRole('button', { name: `Open ${task.title}`, exact: true }),
      ).toBeFocused()
      expect(pageErrors).toEqual([])
    })
  }
}
