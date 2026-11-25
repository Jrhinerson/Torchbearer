import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

test.setTimeout(90000)

async function backlog(
  page: Page,
  title: string,
  mode = 'hybrid',
  frontier = 'codex',
) {
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  const composer = page.getByRole('dialog', { name: 'New task', exact: true })
  await composer.getByLabel('Title', { exact: false }).fill(title)
  await composer.getByLabel('Approach', { exact: true }).selectOption(mode)
  if (mode !== 'local_only')
    await composer
      .getByLabel('Frontier agent', { exact: true })
      .selectOption(frontier)
  await composer.getByRole('button', { name: /^Project optional/ }).click()
  await composer
    .getByRole('button', {
      name: 'Select Browser fixture repository',
      exact: true,
    })
    .click()
  await composer.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await expect(card).toBeVisible()
  return card
}

async function start(page: Page, card: Locator, title: string) {
  await card
    .getByRole('button', { name: 'Start planning', exact: true })
    .click()
  await card.getByRole('button', { name: /View run|Review step/ }).click()
  return page.getByRole('dialog', { name: title, exact: true })
}

async function advance(review: Locator, name: string) {
  const button = review.getByRole('button', { name, exact: true })
  await expect(button).toBeEnabled({ timeout: 20000 })
  await button.click()
}

test('defaults to Frontier and Codex and edits only the chosen backlog task', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByLabel(/^Agent for /)).toHaveCount(0)
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  const composer = page.getByRole('dialog', { name: 'New task', exact: true })
  await expect(composer.getByLabel('Approach', { exact: true })).toHaveValue(
    'frontier',
  )
  await expect(
    composer.getByLabel('Frontier agent', { exact: true }),
  ).toHaveValue('codex')
  await expect(
    composer.getByLabel('Frontier agent').locator('option'),
  ).toHaveText(['Codex', 'Claude Code'])
  await composer.getByRole('button', { name: 'Cancel', exact: true }).click()
  const title = `Editable routing ${Date.now()}`
  const card = await backlog(page, title, 'frontier')
  const otherTitle = `Independent routing ${Date.now()}`
  await backlog(page, otherTitle, 'frontier', 'claude')
  await card.getByText('Edit routing', { exact: true }).click()
  await card.getByLabel('Approach', { exact: true }).selectOption('local_only')
  await expect(card.getByLabel('Frontier agent')).toHaveCount(0)
  await card.getByRole('button', { name: 'Save routing' }).click()
  await expect(
    card.getByRole('button', { name: 'Save routing', includeHidden: true }),
  ).toBeDisabled()
  await page.reload()
  await expect(card.getByLabel('Approach', { exact: true })).toHaveValue(
    'local_only',
  )
  await expect(
    page
      .getByRole('article', { name: otherTitle, exact: true })
      .getByLabel('Frontier agent'),
  ).toHaveValue('claude')
})

test('retains routing drafts and reports failed saves', async ({ page }) => {
  await page.goto('/')
  const title = `Routing save failure ${Date.now()}`
  const card = await backlog(page, title)
  await page.route('**/api/v1/tasks/*/', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, json: { detail: 'Routing save failed' } })
      : route.continue(),
  )
  await card.getByText('Edit routing', { exact: true }).click()
  await card.getByLabel('Approach', { exact: true }).selectOption('local_only')
  await card.getByRole('button', { name: 'Save routing' }).click()
  await expect(card.getByRole('alert')).toContainText('Routing save failed')
  await expect(card.getByLabel('Approach', { exact: true })).toHaveValue(
    'local_only',
  )
  await page.unroute('**/api/v1/tasks/*/')
  await card.getByRole('button', { name: 'Save routing' }).click()
  await expect(
    card.getByRole('button', { name: 'Save routing', includeHidden: true }),
  ).toBeDisabled()
})

for (const policy of [
  {
    mode: 'frontier',
    frontier: 'codex',
    agents: ['codex', 'codex', 'codex'],
  },
  {
    mode: 'frontier',
    frontier: 'claude',
    agents: ['claude', 'claude', 'claude'],
  },
  {
    mode: 'hybrid',
    frontier: 'claude',
    agents: ['claude', 'pi', 'claude'],
  },
  { mode: 'local_only', frontier: 'codex', agents: ['pi', 'pi', 'pi'] },
]) {
  test(`runs ${policy.mode} with ${policy.frontier} through Code Review and final approval`, async ({
    page,
  }) => {
    await page.goto('/')
    const title = `${policy.mode} ${policy.frontier} workflow ${Date.now()}`
    const card = await backlog(page, title, policy.mode, policy.frontier)
    const review = await start(page, card, title)
    const stages = ['Plan', 'Integrate', 'Code_Review']
    const buttons = [
      'Approve plan & start Integrate',
      'Approve implementation & start Code Review',
      'Approve code review & continue',
    ]
    for (let index = 0; index < stages.length; index++) {
      await expect(
        review.getByText(
          `${stages[index]} completed by ${policy.agents[index]}`,
          { exact: true },
        ),
      ).toBeVisible({ timeout: 20000 })
      await expect(card.getByLabel('Approach')).toHaveCount(0)
      await advance(review, buttons[index])
    }
    await expect(
      review.getByRole('region', { name: 'Final approval brief' }),
    ).toBeVisible()
    await expect(
      review.getByRole('region', { name: 'Implementation validation' }),
    ).toContainText('python -m pytest')
    await advance(review, 'Give final approval')
    await expect(review.getByText(/^Approved/)).toBeVisible()
    if (policy.mode === 'hybrid') {
      const tasks = await page.request
        .get('/api/v1/tasks/')
        .then((response) => response.json())
      const task = tasks.find((item: { title: string }) => item.title === title)
      const before = await page.request
        .get(`/api/v1/tasks/${task.id}/workspace/`)
        .then((response) => response.json())
      await review
        .getByRole('button', { name: 'Run retrospective', exact: true })
        .click()
      await expect(
        review.getByText('Retro completed by claude', { exact: true }),
      ).toBeVisible({ timeout: 20000 })
      await expect(
        review.getByText(
          'Suggested follow-up: add an automated regression check.',
          { exact: true },
        ),
      ).toBeVisible()
      await expect(review.getByText(/^Approved/)).toBeVisible()
      await expect(
        review.getByRole('button', { name: 'Give final approval' }),
      ).toHaveCount(0)
      const after = await page.request
        .get(`/api/v1/tasks/${task.id}/workspace/`)
        .then((response) => response.json())
      expect(after.fingerprint).toBe(before.fingerprint)
    }
    await review.getByRole('button', { name: 'Close task review' }).click()
    await page.reload()
    await expect(card).toContainText('Approved')
    await card.getByRole('button', { name: 'View history' }).click()
    await expect(page.getByLabel('Run history').locator('option')).toHaveCount(
      policy.mode === 'hybrid' ? 4 : 3,
    )
  })
}

test('refines a Backlog task through questions and carries the answers into Plan', async ({
  page,
}) => {
  await page.goto('/')
  const title = `[refine] Add task priorities ${Date.now()}`
  const card = await backlog(page, title, 'frontier', 'codex')
  await card.getByRole('button', { name: 'Refine task', exact: true }).click()
  const review = page.getByRole('dialog', { name: title, exact: true })
  await expect(
    review.getByRole('heading', { name: 'Clarify task scope', exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect(
    page
      .getByRole('region', { name: 'Backlog', exact: true })
      .getByRole('article', { name: title }),
  ).toBeVisible()
  await expect(card.getByLabel('Approach', { exact: true })).toHaveCount(0)
  await expect(card.getByRole('button', { name: /^Delete / })).toHaveCount(0)
  await review
    .getByLabel('Refinement answers or instructions')
    .fill('Display only; do not change sorting.')
  await review
    .getByRole('button', { name: 'Send answers', exact: true })
    .click()
  await expect(
    review.getByText('Refine completed by codex', { exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await advance(review, 'Start planning')
  await expect(
    review.getByText('Plan completed by codex', { exact: true }),
  ).toBeVisible({ timeout: 20000 })
  const tasks = await page.request
    .get('/api/v1/tasks/')
    .then((response) => response.json())
  const task = tasks.find((item: { title: string }) => item.title === title)
  const history = await page.request
    .get(`/api/v1/tasks/${task.id}/runs/`)
    .then((response) => response.json())
  expect(
    history.runs[0].input_context.artifacts.refinement.result.details,
  ).toContain('Display only')
  expect(history.runs).toHaveLength(3)
})

test('requires one routing choice before continuing an existing started task', async ({
  page,
}) => {
  await page.goto('/')
  const card = page.getByRole('article', {
    name: 'Existing task needs routing',
    exact: true,
  })
  await expect(card).toContainText('Choose routing before continuing')
  await card.getByLabel('Approach', { exact: true }).focus()
  await card.getByLabel('Approach', { exact: true }).press('End')
  await expect(card.getByLabel('Approach', { exact: true })).toHaveValue(
    'local_only',
  )
  await card.getByRole('button', { name: 'Save routing' }).click()
  await expect(card.getByLabel('Approach')).toHaveCount(0)
  await card.getByRole('button', { name: 'Review step' }).click()
  const review = page.getByRole('dialog', {
    name: 'Existing task needs routing',
    exact: true,
  })
  await advance(review, 'Retry step')
  await expect(
    review.getByText('Plan completed by pi', { exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect(review.getByLabel('Run history').locator('option')).toHaveCount(
    2,
  )
})

for (const failure of ['validation', 'review']) {
  test(`leaves failed ${failure} for human-directed rework`, async ({
    page,
  }) => {
    await page.goto('/')
    const title = `[${failure} fails] Rework ${Date.now()}`
    const card = await backlog(page, title)
    const review = await start(page, card, title)
    await advance(review, 'Approve plan & start Integrate')
    if (failure === 'review')
      await advance(review, 'Approve implementation & start Code Review')
    await expect(
      review.getByRole('button', { name: 'Retry step' }),
    ).toBeEnabled({ timeout: 20000 })
    await review
      .getByLabel('Revision or rework instructions')
      .fill('Fix the reported regression.')
    await review
      .getByRole('button', {
        name:
          failure === 'review' ? 'Send back to Integrate' : 'Request revision',
      })
      .click()
    await expect(review.locator('.run-review > .run-state')).toContainText(
      'Awaiting review',
      { timeout: 20000 },
    )
    await expect(
      review.getByRole('heading', {
        name: 'Integrate completed by pi',
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 })
    if (failure === 'review') {
      await advance(review, 'Approve implementation & start Code Review')
      await advance(review, 'Approve code review & continue')
      await advance(review, 'Give final approval')
      await expect(review.getByText(/^Approved/)).toBeVisible()
      await expect(
        review.getByLabel('Run history').locator('option'),
      ).toHaveCount(5)
    }
  })
}

test('cancels a running process and preserves its history', async ({
  page,
}) => {
  await page.goto('/')
  const title = `[cancel] Long task ${Date.now()}`
  const review = await start(page, await backlog(page, title), title)
  await expect(review.locator('.run-review > .run-state')).toContainText(
    'Running',
    { timeout: 20000 },
  )
  await review.getByRole('button', { name: 'Cancel run', exact: true }).click()
  await expect(review.locator('.run-review > .run-state')).toContainText(
    'Cancelled',
    { timeout: 10000 },
  )
  await expect(review.getByRole('button', { name: 'Retry step' })).toBeEnabled()
})

test('prevents approval after the reviewed code changes', async ({ page }) => {
  await page.goto('/')
  const title = `Stale review ${Date.now()}`
  const review = await start(page, await backlog(page, title), title)
  const approve = review.getByRole('button', {
    name: 'Approve plan & start Integrate',
  })
  await expect(approve).toBeEnabled({ timeout: 20000 })
  const tasks = await page.request
    .get('/api/v1/tasks/')
    .then((response) => response.json())
  const task = tasks.find((item: { title: string }) => item.title === title)
  await writeFile(
    path.join(task.workspace_path, 'README.md'),
    'Changed after review\n',
  )
  await expect(approve).toBeDisabled({ timeout: 10000 })
  await expect(review.getByText(/made this result stale/)).toBeVisible()
})
