import { operationsFixture } from './fixtures/operations'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type {
  Agent,
  Routing,
  RunSummary,
  Task,
} from '../../src/features/tasks/api'

const routing: Routing = {
  agents: [
    { id: 'codex', label: 'Codex', kind: 'frontier', available: true },
    { id: 'claude', label: 'Claude Code', kind: 'frontier', available: true },
    { id: 'pi', label: 'Pi', kind: 'local', available: true },
  ],
  approaches: [],
  worker: { available: true, heartbeat: null, active_run: null },
}

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: 'run-1',
    stage: 'plan',
    agent: 'codex',
    state: 'running',
    sequence: 1,
    error: '',
    cancel_requested: false,
    ...overrides,
  }
}

function task(title: string, overrides: Partial<Task> = {}): Task {
  return {
    id: title.replace(/\W/g, '-'),
    title,
    description: 'Details remain available when expanded.',
    work_type: null,
    workflow_snapshot: {
      schema_version: 1,
      key: 'legacy-standard',
      name: 'Legacy engineering workflow',
      definition_version: 1,
      execution_mode: 'legacy',
      result_contract: 1,
      steps: [],
      stage_labels: {},
    },
    project: null,
    repository: null,
    routing_mode: 'hybrid',
    frontier_agent: 'codex',
    stage_agents: {
      plan: 'codex',
      integrate: 'pi',
      code_review: 'codex',
    },
    next_stage: 'integrate',
    status: 'plan',
    revision: 0,
    completed_at: null,
    latest_run: run(),
    workspace_path: '',
    branch: '',
    base_commit: '',
    created_at: '2026-11-21T12:00:00Z',
    updated_at: '2026-11-21T12:00:00Z',
    ...overrides,
  }
}

async function seedBoard(page: Page, initialTasks: Task[]) {
  let tasks = initialTasks
  await page.route('**/api/v1/operations/?**', (route) =>
    route.fulfill({ json: operationsFixture(tasks) }),
  )
  await page.route('**/api/v1/routing/', (route) =>
    route.fulfill({ json: routing }),
  )
  await page.route('**/api/v1/repositories/', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.goto('/')
  await expect(page.getByRole('article')).toHaveCount(tasks.length)
  await page.evaluate(() => document.fonts.ready)
  return (updated: Task[]) => {
    tasks = updated
  }
}

function cardFor(page: Page, title: string) {
  return page.getByRole('article', { name: title, exact: true })
}

async function pulseStyle(card: Locator) {
  return card.evaluate((element) => {
    const style = getComputedStyle(element, '::after')
    return {
      animation: style.animationName,
      duration: style.animationDuration,
      shadow: style.boxShadow,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
    }
  })
}

test('shows the responsible agent for each policy, recorded run, and handoff', async ({
  page,
}) => {
  const tasks = [
    task('Codex backlog', { status: 'backlog', latest_run: null }),
    task('Claude backlog', {
      status: 'backlog',
      latest_run: null,
      frontier_agent: 'claude',
      stage_agents: { plan: 'claude', integrate: 'claude' },
    }),
    task('Local backlog', {
      status: 'backlog',
      latest_run: null,
      routing_mode: 'local_only',
      frontier_agent: null,
      stage_agents: { plan: 'pi' },
    }),
    task('Hybrid implementation', {
      status: 'integrate',
      latest_run: run({ stage: 'integrate', agent: 'pi' }),
    }),
    task('Recorded agent', { latest_run: run({ agent: 'claude' }) }),
    task('Stage handoff', {
      status: 'integrate',
      latest_run: run({ agent: 'claude', state: 'succeeded' }),
    }),
    task('Final review', {
      status: 'final_approval',
      latest_run: run({
        stage: 'code_review',
        agent: 'claude',
        state: 'succeeded',
      }),
    }),
    task('Unassigned agent', {
      status: 'backlog',
      routing_mode: null,
      frontier_agent: null,
      stage_agents: {},
      latest_run: null,
    }),
  ]
  await seedBoard(page, tasks)
  const expected: [string, Agent][] = [
    ['Codex backlog', 'codex'],
    ['Claude backlog', 'claude'],
    ['Local backlog', 'pi'],
    ['Hybrid implementation', 'pi'],
    ['Recorded agent', 'claude'],
    ['Stage handoff', 'pi'],
    ['Final review', 'claude'],
  ]
  for (const [title, agent] of expected) {
    const card = cardFor(page, title)
    const name = routing.agents.find((entry) => entry.id === agent)!.label
    await expect(card.getByRole('img')).toHaveAccessibleName(new RegExp(name))
    const logo = card.locator('.task-agent-logo')
    await expect(logo).toHaveAttribute('data-agent', agent)
    expect(
      await logo.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
      ),
    ).toBe(true)
  }
  const handoff = cardFor(page, 'Stage handoff')
  await expect(handoff).toHaveAttribute('data-activity', 'idle')
  await expect(handoff.locator('.task-agent-spinner')).toBeHidden()
  const unassigned = cardFor(page, 'Unassigned agent')
  await expect(unassigned.getByRole('img')).toHaveAccessibleName(
    'Agent unassigned · Routing needed',
  )
  await expect(unassigned.locator('.task-agent-logo')).toHaveCount(0)
})

test('switches between queued, running, human input, and completed without reloading', async ({
  page,
}) => {
  await page.clock.install()
  const current = task('Live task', { latest_run: run({ state: 'queued' }) })
  const update = await seedBoard(page, [current])
  const card = cardFor(page, current.title)
  const spinner = card.locator('.task-agent-spinner')
  const logo = card.locator('.task-agent-logo')
  const originalLogo = (await logo.boundingBox())!
  await expect(card.getByRole('img')).toHaveAccessibleName('Codex · Queued')
  await expect(spinner).toBeHidden()

  async function refresh(updated: Task) {
    update([updated])
    const response = page.waitForResponse('**/api/v1/operations/?**')
    await page.clock.runFor(2100)
    await response
  }

  await refresh({ ...current, latest_run: run() })
  await expect(spinner).toBeVisible()
  await expect(spinner).toHaveCSS('animation-duration', '0.9s')
  await expect(card.getByRole('img')).toHaveAccessibleName('Codex · Running')
  expect((await logo.boundingBox())!.x).toBe(originalLogo.x)
  const rotation = await spinner.evaluate((element) => {
    const animation = element.getAnimations()[0]!
    animation.pause()
    animation.currentTime = 0
    const start = getComputedStyle(element).transform
    animation.currentTime = 450
    return { start, halfway: getComputedStyle(element).transform }
  })
  expect(rotation.halfway).not.toBe(rotation.start)

  const expand = card.getByRole('button', { name: `Expand ${current.title}` })
  await expand.press('Enter')
  await expect(
    card.getByText(current.description, { exact: true }),
  ).toBeVisible()
  await refresh({ ...current, latest_run: run({ state: 'succeeded' }) })
  await expect(card.getByRole('img')).toHaveAccessibleName(
    'Codex · Awaiting review',
  )
  await expect(spinner).toBeHidden()
  await expect(
    card.getByRole('button', { name: `Collapse ${current.title}` }),
  ).toHaveAttribute('aria-expanded', 'true')
  expect(await pulseStyle(card)).toMatchObject({
    animation: 'task-attention-pulse',
    duration: '4s',
    pointerEvents: 'none',
  })
  const glow = await card.evaluate((element) => {
    const animation = element
      .getAnimations({ subtree: true })
      .find(
        (item) =>
          (item as CSSAnimation).animationName === 'task-attention-pulse',
      )!
    animation.pause()
    animation.currentTime = 0
    const start = Number(getComputedStyle(element, '::after').opacity)
    animation.currentTime = 2000
    return { start, peak: Number(getComputedStyle(element, '::after').opacity) }
  })
  expect(glow.peak).toBeGreaterThan(glow.start)

  await refresh({ ...current, latest_run: run({ sequence: 2 }) })
  await expect(spinner).toBeVisible()
  expect((await pulseStyle(card)).animation).toBe('none')
  await refresh({ ...current, latest_run: run({ state: 'blocked' }) })
  await expect(card.getByRole('img')).toHaveAccessibleName(
    'Codex · Blocked — human input needed',
  )
  await expect(spinner).toBeHidden()
  expect((await pulseStyle(card)).animation).toBe('task-attention-pulse')

  const final = {
    ...current,
    status: 'final_approval' as const,
    latest_run: run({ stage: 'code_review', state: 'succeeded' }),
  }
  await refresh(final)
  await expect(card.getByRole('img')).toHaveAccessibleName(
    'Codex · Awaiting final approval',
  )
  expect((await pulseStyle(card)).animation).toBe('task-attention-pulse')
  await refresh({ ...final, completed_at: '2026-11-21T13:00:00Z' })
  await expect(card.getByRole('img')).toHaveAccessibleName('Codex · Approved')
  await expect(spinner).toBeHidden()
  expect((await pulseStyle(card)).animation).toBe('none')
})

test('keeps inactive and unsuccessful attempts still', async ({ page }) => {
  const tasks = (['queued', 'failed', 'cancelled', 'interrupted'] as const).map(
    (state) => task(state, { latest_run: run({ state }) }),
  )
  tasks.push(task('No attempt', { latest_run: null }))
  await seedBoard(page, tasks)
  for (const item of tasks) {
    const card = cardFor(page, item.title)
    await expect(card).toHaveAttribute('data-activity', 'idle')
    await expect(card.locator('.task-agent-spinner')).toBeHidden()
    expect((await pulseStyle(card)).animation).toBe('none')
  }
})

for (const theme of ['dark', 'light'] as const) {
  for (const width of [1440, 320]) {
    test(`aligns ticket indicators with long titles at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      const long = task(
        'ImplementSupercalifragilisticexpialidociousRoutingAndReview',
        {
          latest_run: run({ state: 'succeeded' }),
        },
      )
      const running = task('Running task')
      await seedBoard(page, [running, long])
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value
      }, theme)

      for (const size of ['100%', '200%']) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = value
        }, size)
        for (const item of [running, long]) {
          const card = cardFor(page, item.title)
          await card.scrollIntoViewIfNeeded()
          const layout = await card.evaluate((element) => {
            const title = element.querySelector('.task-title-button')!
            const range = document.createRange()
            range.selectNodeContents(title)
            const firstLine = range.getClientRects()[0]!
            const logo = element
              .querySelector('.task-agent-logo')!
              .getBoundingClientRect()
            const spinner = element
              .querySelector('.task-agent-spinner')!
              .getBoundingClientRect()
            const control = element
              .querySelector('.task-collapse-button')!
              .getBoundingClientRect()
            return {
              fits: element.scrollWidth <= element.clientWidth,
              heading: getComputedStyle(
                element.querySelector('.task-card-heading')!,
              ).gridTemplateColumns,
              sizes: [...element.children].map((child) => ({
                class: child.className,
                width: child.clientWidth,
                scroll: child.scrollWidth,
                right: child.getBoundingClientRect().right,
              })),
              overflow: [...element.querySelectorAll('*')]
                .filter(
                  (child) =>
                    child.getBoundingClientRect().right >
                    element.getBoundingClientRect().right,
                )
                .map((child) => child.className),
              titleRight: title.getBoundingClientRect().right,
              firstLineCenter: firstLine.top + firstLine.height / 2,
              logoCenter: logo.top + logo.height / 2,
              spinnerRight: spinner.right,
              logoLeft: logo.left,
              logoRight: logo.right,
              cardRight: element.getBoundingClientRect().right,
              controlWidth: control.width,
              controlHeight: control.height,
            }
          })
          expect(layout.fits, JSON.stringify(layout)).toBe(true)
          expect(layout.titleRight).toBeLessThanOrEqual(layout.logoLeft)
          expect(layout.spinnerRight).toBeLessThan(layout.logoLeft)
          expect(layout.logoLeft - layout.spinnerRight).toBeLessThanOrEqual(8)
          expect(layout.cardRight - layout.logoRight).toBeLessThanOrEqual(26)
          expect(
            Math.abs(layout.firstLineCenter - layout.logoCenter),
          ).toBeLessThanOrEqual(8)
          expect(layout.controlWidth).toBeGreaterThanOrEqual(44)
          expect(layout.controlHeight).toBeGreaterThanOrEqual(44)
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true)
      }

      await page.evaluate(() => {
        document.documentElement.style.fontSize = ''
      })
      const runningCard = cardFor(page, running.title)
      await runningCard.scrollIntoViewIfNeeded()
      await expect(runningCard.locator('.task-agent-logo')).toHaveCSS(
        'filter',
        theme === 'dark' ? 'brightness(0) invert(1)' : 'brightness(0)',
      )
      const shadow = (await pulseStyle(cardFor(page, long.title))).shadow
      expect(shadow).not.toBe('none')
      const navigationGold = await page
        .getByRole('link', { name: 'Operations', exact: true })
        .evaluate((element) => getComputedStyle(element).borderTopColor)
      expect(shadow).toContain(navigationGold)
      // Preserve a repeatable frame for visual review without fading the text.
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) {
          animation.pause()
          animation.currentTime = 2000
        }
      })
      await page.screenshot({
        path: testInfo.outputPath(`ticket-indicators-${theme}-${width}.png`),
        fullPage: true,
      })
    })
  }
}

test('replaces motion with steady indicators when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const running = task('Running with reduced motion')
  const waiting = task('Waiting with reduced motion', {
    latest_run: run({ state: 'succeeded' }),
  })
  await seedBoard(page, [running, waiting])
  const runningCard = cardFor(page, running.title)
  const waitingCard = cardFor(page, waiting.title)
  await expect(runningCard.locator('.task-agent-spinner')).toBeVisible()
  await expect(runningCard.locator('.task-agent-spinner')).toHaveCSS(
    'animation-name',
    'none',
  )
  await expect(runningCard.getByRole('img')).toHaveAccessibleName(
    'Codex · Running',
  )
  await expect(waitingCard.locator('.task-agent-spinner')).toBeHidden()
  expect(await pulseStyle(waitingCard)).toMatchObject({
    animation: 'none',
    opacity: '0.55',
  })
  expect((await pulseStyle(waitingCard)).shadow).not.toBe('none')
  await expect(waitingCard.getByRole('img')).toHaveAccessibleName(
    'Codex · Awaiting review',
  )
})
