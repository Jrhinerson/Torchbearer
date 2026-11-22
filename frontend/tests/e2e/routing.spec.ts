import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

test.setTimeout(60000)

async function configure(page: Page) {
  await page.goto('/')
  await page.getByLabel('Agent for plan', { exact: true }).selectOption('codex')
  await page
    .getByLabel('Agent for integrate', { exact: true })
    .selectOption('claude')
  await page.getByLabel('Agent for test', { exact: true }).selectOption('pi')
  await expect(page.getByLabel('Agent for test', { exact: true })).toBeEnabled()
}

async function create(page: Page, title: string) {
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  const composer = page.getByRole('dialog', { name: 'New task', exact: true })
  await composer.getByLabel('Title', { exact: false }).fill(title)
  const repositories = await page.request
    .get('/api/v1/repositories/')
    .then((response) => response.json())
  await composer
    .getByLabel('Repository', { exact: true })
    .selectOption(repositories[0].id)
  await composer.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await expect(card).toBeVisible()
  await card
    .getByRole('button', { name: 'Start planning', exact: true })
    .click()
  await expect(
    card.getByRole('button', { name: /View run|Review step/ }),
  ).toBeVisible()
  await card.getByRole('button', { name: /View run|Review step/ }).click()
  return page.getByRole('dialog', { name: title, exact: true })
}

test('offers agent dropdowns only in working columns and persists assignments', async ({
  page,
}) => {
  await configure(page)
  await expect(page.getByLabel('Agent for backlog')).toHaveCount(0)
  await expect(page.getByLabel('Agent for final_approval')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Agent for plan', { exact: true })).toHaveValue(
    'codex',
  )
  await expect(
    page.getByLabel('Agent for integrate', { exact: true }),
  ).toHaveValue('claude')
  await expect(page.getByLabel('Agent for test', { exact: true })).toHaveValue(
    'pi',
  )
})

test('keeps the previous assignment when saving fails', async ({ page }) => {
  await configure(page)
  await page.route('**/api/v1/routing/plan/', (route) =>
    route.fulfill({ status: 500, json: { detail: 'Assignment failed' } }),
  )
  await page.getByLabel('Agent for plan', { exact: true }).selectOption('pi')
  await expect(page.getByLabel('Agent for plan', { exact: true })).toHaveValue(
    'codex',
  )
  await expect(page.getByRole('alert')).toContainText('Assignment failed')
})

test('runs mixed agents with a human approval gate at every stage', async ({
  page,
}, testInfo) => {
  await configure(page)
  const title = `Mixed agent workflow ${Date.now()}`
  const review = await create(page, title)
  await expect(
    review.getByText('Plan completed by codex', { exact: true }),
  ).toBeVisible({ timeout: 20000 })
  const approvePlan = review.getByRole('button', {
    name: 'Approve plan & start Integrate',
  })
  await expect(approvePlan).toBeEnabled({ timeout: 10000 })
  await page.screenshot({
    path: testInfo.outputPath('plan-review.png'),
    fullPage: true,
  })
  await approvePlan.click()
  await expect(
    review.getByText('Integrate completed by claude', { exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await review.getByText('Current code changes', { exact: true }).click()
  await expect(review.locator('.run-log').last()).toContainText('feature.txt')
  await review
    .getByRole('button', { name: 'Approve changes & start Test' })
    .click()
  await expect(
    review.getByText('Test completed by pi', { exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect(
    review.getByRole('button', { name: 'Approve test & continue' }),
  ).toBeEnabled()
  await review.getByRole('button', { name: 'Approve test & continue' }).click()
  await expect(
    review.getByRole('button', { name: 'Give final approval' }),
  ).toBeEnabled()
  await review.getByRole('button', { name: 'Give final approval' }).click()
  await expect(review.getByText(/^Approved ·/)).toBeVisible()
  await review.getByRole('button', { name: 'Close task review' }).click()
  await page.reload()
  const final = page.getByRole('region', {
    name: 'Final Approval',
    exact: true,
  })
  await expect(final.getByRole('article', { name: title })).toContainText(
    'Approved',
  )
  await final
    .getByRole('article', { name: title })
    .getByRole('button', { name: 'View history' })
    .click()
  await expect(page.getByLabel('Run history').locator('option')).toHaveCount(3)
})

test('leaves failing tests for human-directed rework in Integrate', async ({
  page,
}) => {
  await configure(page)
  const title = `[test fails] Rework ${Date.now()}`
  const review = await create(page, title)
  await expect(
    review.getByRole('button', { name: 'Approve plan & start Integrate' }),
  ).toBeEnabled({ timeout: 20000 })
  await review
    .getByRole('button', { name: 'Approve plan & start Integrate' })
    .click()
  await expect(
    review.getByRole('button', { name: 'Approve changes & start Test' }),
  ).toBeEnabled({ timeout: 20000 })
  await review
    .getByRole('button', { name: 'Approve changes & start Test' })
    .click()
  await expect(review.getByRole('button', { name: 'Retry step' })).toBeEnabled({
    timeout: 20000,
  })
  await expect(
    review.getByRole('button', { name: 'Approve test & continue' }),
  ).toHaveCount(0)
  await review
    .getByLabel('Revision or rework instructions')
    .fill('Fix the failing validation command.')
  await review.getByRole('button', { name: 'Send back to Integrate' }).click()
  await expect(
    review.getByText('Integrate completed by claude', { exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect(page.getByLabel('Run history').locator('option')).toHaveCount(4)
})

test('cancels a running process and preserves its history', async ({
  page,
}) => {
  await configure(page)
  const title = `[cancel] Long task ${Date.now()}`
  const review = await create(page, title)
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
  await configure(page)
  const title = `Stale review ${Date.now()}`
  const review = await create(page, title)
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
