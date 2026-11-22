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
    .getByRole('button', { name: `Expand ${title}`, exact: true })
    .click()
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
  await expect(card.getByLabel('Approach')).toHaveCount(0)
  await expect(card.getByLabel('Repository', { exact: true })).toHaveCount(0)
  await expect(card.getByText('Edit routing', { exact: true })).toHaveCount(0)
  await expect(
    card.getByRole('button', { name: 'Add repository', exact: true }),
  ).toHaveCount(0)
  await card.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  const settings = page.getByRole('dialog', { name: title, exact: true })
  await settings
    .getByLabel('Approach', { exact: true })
    .selectOption('local_only')
  await expect(settings.getByLabel('Frontier agent')).toHaveCount(0)
  await settings.getByRole('button', { name: 'Save routing' }).click()
  await expect(
    settings.getByRole('button', { name: 'Save routing' }),
  ).toBeDisabled()
  await settings.getByRole('button', { name: 'Close task settings' }).click()
  await expect(
    card.getByRole('button', { name: `Open ${title}`, exact: true }),
  ).toBeFocused()
  await page.reload()
  await card
    .getByRole('button', { name: `Expand ${title}`, exact: true })
    .click()
  await page
    .getByRole('article', { name: otherTitle, exact: true })
    .getByRole('button', { name: `Expand ${otherTitle}`, exact: true })
    .click()
  await expect(card).toContainText('Local Only')
  await expect(
    page.getByRole('article', { name: otherTitle, exact: true }),
  ).toContainText('Frontier - Claude Code')
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
  await card.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  const settings = page.getByRole('dialog', { name: title, exact: true })
  await settings
    .getByLabel('Approach', { exact: true })
    .selectOption('local_only')
  await settings.getByRole('button', { name: 'Save routing' }).click()
  await expect(settings.getByRole('alert')).toContainText('Routing save failed')
  await expect(settings.getByLabel('Approach', { exact: true })).toHaveValue(
    'local_only',
  )
  await page.unroute('**/api/v1/tasks/*/')
  await settings.getByRole('button', { name: 'Save routing' }).click()
  await expect(
    settings.getByRole('button', { name: 'Save routing' }),
  ).toBeDisabled()
})

test('chooses a missing repository in settings while keeping card controls compact', async ({
  page,
}) => {
  await page.goto('/')
  const title = `Repository settings ${Date.now()}`
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  const composer = page.getByRole('dialog', { name: 'New task', exact: true })
  await composer.getByLabel('Title', { exact: false }).fill(title)
  await composer.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await card
    .getByRole('button', { name: `Expand ${title}`, exact: true })
    .click()
  await expect(card.getByRole('combobox')).toHaveCount(0)
  await expect(
    card.getByRole('button', { name: 'Start planning', exact: true }),
  ).toBeDisabled()
  await card.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  const settings = page.getByRole('dialog', { name: title, exact: true })
  const repository = settings.getByRole('combobox', {
    name: 'Repository',
    exact: true,
  })
  const id = await repository.locator('option').nth(1).getAttribute('value')
  await repository.selectOption(id!)
  await expect(repository).toHaveValue(id!)
  await page.keyboard.press('Escape')
  await expect(settings).toHaveCount(0)
  await expect(
    card.getByRole('button', { name: `Open ${title}`, exact: true }),
  ).toBeFocused()
  await expect(
    card.getByRole('button', { name: 'Start planning', exact: true }),
  ).toBeEnabled()
  await page.reload()
  await expect(card).toContainText('Browser fixture repository')
  await expect(card.getByRole('combobox')).toHaveCount(0)
})

for (const policy of [
  {
    mode: 'frontier',
    frontier: 'codex',
    agents: ['codex', 'codex', 'codex', 'codex'],
  },
  {
    mode: 'frontier',
    frontier: 'claude',
    agents: ['claude', 'claude', 'claude', 'claude'],
  },
  {
    mode: 'hybrid',
    frontier: 'claude',
    agents: ['claude', 'pi', 'pi', 'claude'],
  },
  { mode: 'local_only', frontier: 'codex', agents: ['pi', 'pi', 'pi', 'pi'] },
]) {
  test(`runs ${policy.mode} with ${policy.frontier} through Code Review and final approval`, async ({
    page,
  }) => {
    await page.goto('/')
    const title = `${policy.mode} ${policy.frontier} workflow ${Date.now()}`
    const card = await backlog(page, title, policy.mode, policy.frontier)
    const review = await start(page, card, title)
    const stages = ['Plan', 'Integrate', 'Test', 'Code_Review']
    const buttons = [
      'Approve plan & start Integrate',
      'Approve changes & start Test',
      'Approve test & start Code Review',
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
    await advance(review, 'Give final approval')
    await expect(review.getByText(/^Approved/)).toBeVisible()
    await review.getByRole('button', { name: 'Close task review' }).click()
    await page.reload()
    await card
      .getByRole('button', { name: `Expand ${title}`, exact: true })
      .click()
    await expect(card).toContainText('Approved')
    await card.getByRole('button', { name: 'View history' }).click()
    await expect(page.getByLabel('Run history').locator('option')).toHaveCount(
      4,
    )
  })
}

test('requires one routing choice before continuing an existing started task', async ({
  page,
}) => {
  await page.goto('/')
  const card = page.getByRole('article', {
    name: 'Existing task needs routing',
    exact: true,
  })
  await card
    .getByRole('button', {
      name: 'Expand Existing task needs routing',
      exact: true,
    })
    .click()
  await expect(card.getByLabel('Approach')).toHaveCount(0)
  await card.getByRole('button', { name: 'Review step' }).click()
  const review = page.getByRole('dialog', {
    name: 'Existing task needs routing',
    exact: true,
  })
  await expect(review).toContainText('Choose routing before continuing')
  await review.getByLabel('Approach', { exact: true }).focus()
  await review.getByLabel('Approach', { exact: true }).press('End')
  await expect(review.getByLabel('Approach', { exact: true })).toHaveValue(
    'local_only',
  )
  await review.getByRole('button', { name: 'Save routing' }).click()
  await expect(review.getByLabel('Approach')).toHaveCount(0)
  await advance(review, 'Retry step')
  await expect(
    review.getByText('Plan completed by pi', { exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect(review.getByLabel('Run history').locator('option')).toHaveCount(
    2,
  )
})

for (const failure of ['test', 'review']) {
  test(`leaves failed ${failure} for human-directed rework`, async ({
    page,
  }) => {
    await page.goto('/')
    const title = `[${failure} fails] Rework ${Date.now()}`
    const card = await backlog(page, title)
    const review = await start(page, card, title)
    await advance(review, 'Approve plan & start Integrate')
    await advance(review, 'Approve changes & start Test')
    if (failure === 'review')
      await advance(review, 'Approve test & start Code Review')
    await expect(
      review.getByRole('button', { name: 'Retry step' }),
    ).toBeEnabled({ timeout: 20000 })
    await review
      .getByLabel('Revision or rework instructions')
      .fill('Fix the reported regression.')
    await review.getByRole('button', { name: 'Send back to Integrate' }).click()
    await expect(
      review.getByText('Integrate completed by pi', { exact: true }),
    ).toBeVisible({ timeout: 20000 })
    if (failure === 'review') {
      await advance(review, 'Approve changes & start Test')
      await advance(review, 'Approve test & start Code Review')
      await advance(review, 'Approve code review & continue')
      await advance(review, 'Give final approval')
      await expect(review.getByText(/^Approved/)).toBeVisible()
      await expect(
        review.getByLabel('Run history').locator('option'),
      ).toHaveCount(7)
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
