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
    refine: 'codex',
    retro: 'codex',
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

async function openPlanning(
  page: Page,
  theme: string,
  status = 'plan',
  completed = false,
) {
  const stages = ['plan', 'integrate', 'code_review']
  const count = status === 'final_approval' ? 3 : stages.indexOf(status) + 1
  const attempts = stages.slice(0, count).map((stage, index) => ({
    ...run,
    id: run.id.slice(0, -1) + String(index + 1),
    stage,
    sequence: index + 1,
    state: status === 'plan' ? 'blocked' : 'succeeded',
    review_fingerprint: 'snapshot',
    result: {
      ...run.result,
      outcome: status === 'plan' ? 'blocked' : 'complete',
      summary: status === 'plan' ? run.result.summary : `${stage} result`,
      tests:
        stage === 'integrate'
          ? [
              {
                command: 'python -m pytest',
                outcome: 'pass',
                details: 'All relevant checks passed.',
              },
            ]
          : [],
    },
  }))
  const currentTask = {
    ...task,
    status,
    latest_run: attempts.at(-1),
    completed_at: completed ? timestamp : null,
    workspace_path: 'C:/fixtures/task-workspace',
    branch: 'torchbearer/task',
  }
  await page.route('**/api/v1/tasks/', (route) =>
    route.fulfill({ json: [currentTask] }),
  )
  await page.route(`**/api/v1/tasks/${task.id}/runs/`, (route) =>
    route.fulfill({ json: { runs: [...attempts].reverse(), decisions: [] } }),
  )
  await page.route(`**/api/v1/tasks/${task.id}/workspace/`, (route) =>
    route.fulfill({
      json: {
        fingerprint: 'snapshot',
        diff: '+Reviewed change',
        truncated: false,
      },
    }),
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

const reviewStages = [
  {
    status: 'integrate',
    count: 2,
    approve: 'Approve implementation & start Code Review',
  },
  {
    status: 'code_review',
    count: 3,
    approve: 'Approve code review & continue',
  },
  { status: 'final_approval', count: 3, approve: 'Give final approval' },
]

for (const stage of reviewStages) {
  for (const width of [1280, 320]) {
    test(`${stage.status} uses the shared conversation at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 })
      const dialog = await openPlanning(
        page,
        width === 320 ? 'light' : 'dark',
        stage.status,
      )
      const thread = dialog.getByRole('list', { name: 'Task conversation' })
      const composer = dialog.locator('.planning-composer')
      await expect(dialog.locator('.workflow-run')).toHaveCount(stage.count)
      await expect(dialog.locator('[data-current-run="true"]')).toContainText(
        `${stage.status === 'final_approval' ? 'code_review' : stage.status} result`,
      )
      await expect(
        dialog.getByRole('button', { name: stage.approve, exact: true }),
      ).toBeEnabled()
      await expect(composer).toBeInViewport()
      if (stage.count >= 2) {
        await expect(thread.locator('.workflow-test-report')).toContainText(
          'Passed',
        )
        await expect(thread.locator('.workflow-test-report')).toContainText(
          'python -m pytest',
        )
      }
      const before = await composer.boundingBox()
      await thread.evaluate((element) => {
        element.scrollTop = 0
      })
      await expect(
        dialog.getByRole('button', { name: 'Jump to latest' }),
      ).toBeVisible()
      const after = await composer.boundingBox()
      expect(Math.abs(before!.y - after!.y)).toBeLessThan(2)
      await dialog.getByRole('button', { name: 'Jump to latest' }).click()
      await thread.getByText('Current code changes', { exact: true }).click()
      await expect(
        thread.getByText('+Reviewed change', { exact: true }),
      ).toBeVisible()
      await expect(dialog.getByLabel('Run history')).toHaveCount(0)
      await dialog
        .getByLabel('Revision or rework instructions')
        .fill('Please refine this result.')
      if (stage.status === 'final_approval') {
        await expect(
          dialog.getByRole('button', {
            name: 'Send back to Integrate',
            exact: true,
          }),
        ).toBeEnabled()
        await expect(
          dialog.getByText('Sending returns the task to Integrate', {
            exact: false,
          }),
        ).toBeVisible()
      } else {
        await expect(
          dialog.getByRole('button', { name: 'Request revision', exact: true }),
        ).toBeEnabled()
        await dialog.getByLabel('Message action').selectOption('send_back')
        await expect(
          dialog.getByRole('button', {
            name:
              stage.status === 'integrate'
                ? 'Send back to Plan'
                : 'Send back to Integrate',
            exact: true,
          }),
        ).toBeEnabled()
      }
      await expect(composer).toBeInViewport()
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(false)
      const bounds = await dialog.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    })
  }
}

for (const width of [1280, 320]) {
  test(`completed tasks preserve a read-only conversation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 })
    const dialog = await openPlanning(page, 'dark', 'final_approval', true)
    await expect(dialog.locator('.workflow-run')).toHaveCount(3)
    await expect(dialog.getByText(/^Approved/)).toBeVisible()
    await expect(dialog.getByRole('textbox')).toHaveCount(0)
    await expect(
      dialog.getByRole('button', { name: 'Give final approval' }),
    ).toHaveCount(0)
    await expect(
      dialog.getByRole('button', { name: 'Request revision' }),
    ).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Close task review' }).click()
    await expect(
      page.getByRole('button', { name: `Open ${task.title}`, exact: true }),
    ).toBeFocused()
  })
}
