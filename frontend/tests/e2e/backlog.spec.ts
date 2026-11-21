import { expect, test } from '@playwright/test'

test('creates a task and retrieves it after reloading', async ({
  page,
}, testInfo) => {
  const title = `Define acceptance criteria ${Date.now()}`
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Build with intention.' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add to backlog' }),
  ).toBeEnabled()
  await page.getByLabel('Title', { exact: false }).fill(title)
  await page
    .getByLabel('Description', { exact: false })
    .fill('Decide what success looks like before implementation.')
  await page.getByRole('button', { name: 'Add to backlog' }).click()
  await expect(page.getByRole('article', { name: title })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('article', { name: title })).toContainText(
    'Decide what success looks like',
  )
  await page.screenshot({
    path: testInfo.outputPath('backlog-desktop.png'),
    fullPage: true,
  })
})

test('preserves the draft and shows server validation errors', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Add to backlog' }),
  ).toBeEnabled()
  await page.route('**/api/v1/tasks/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 400,
        json: { title: ['Please make the task title more specific.'] },
      })
    } else await route.continue()
  })
  const title = 'Preserve this draft'
  await page.getByLabel('Title', { exact: false }).fill(title)
  await page.getByRole('button', { name: 'Add to backlog' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Please make the task title more specific.',
  )
  await expect(page.getByLabel('Title', { exact: false })).toHaveValue(title)
  await expect(page.getByRole('article', { name: title })).toHaveCount(0)
})

test('recovers from a failed initial connection', async ({ page }) => {
  await page.route('**/api/v1/tasks/', (route) => route.abort('failed'))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    'Could not reach the local service',
  )
  await expect(
    page.getByRole('button', { name: 'Add to backlog' }),
  ).toBeDisabled()
  await page.unroute('**/api/v1/tasks/')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('button', { name: 'Add to backlog' }),
  ).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('supports task creation on a narrow screen', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const title = `Plan a focused mobile task ${Date.now()}`
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Add to backlog' }),
  ).toBeEnabled()
  await page.getByLabel('Title', { exact: false }).fill(title)
  await page.getByRole('button', { name: 'Add to backlog' }).click()
  await expect(page.getByRole('article', { name: title })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('backlog-mobile.png'),
    fullPage: true,
  })
})

test('cancels deletion and then deletes a task persistently', async ({
  page,
}) => {
  const title = `Delete this backlog task ${Date.now()}`
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Add to backlog' }),
  ).toBeEnabled()
  await page.getByLabel('Title', { exact: false }).fill(title)
  await page.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await expect(card).toBeVisible()

  page.once('dialog', (dialog) => dialog.dismiss())
  await card
    .getByRole('button', { name: `Delete ${title}`, exact: true })
    .click()
  await page.reload()
  await expect(card).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await card
    .getByRole('button', { name: `Delete ${title}`, exact: true })
    .click()
  await expect(card).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Add to backlog' }),
  ).toBeEnabled()
  await expect(card).toHaveCount(0)
})

test('keeps a task when deletion fails and allows retrying', async ({
  page,
}) => {
  const title = `Retry task deletion ${Date.now()}`
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Add to backlog' }),
  ).toBeEnabled()
  await page.getByLabel('Title', { exact: false }).fill(title)
  await page.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await expect(card).toBeVisible()
  await page.route('**/api/v1/tasks/*/', (route) =>
    route.fulfill({
      status: 500,
      json: { detail: 'Could not delete this task. Please try again.' },
    }),
  )
  page.once('dialog', (dialog) => dialog.accept())
  await card
    .getByRole('button', { name: `Delete ${title}`, exact: true })
    .click()
  await expect(card.getByRole('alert')).toHaveText(
    'Could not delete this task. Please try again.',
  )
  await expect(
    card.getByRole('button', { name: `Delete ${title}`, exact: true }),
  ).toBeEnabled()
  await page.unroute('**/api/v1/tasks/*/')
  page.once('dialog', (dialog) => dialog.accept())
  await card
    .getByRole('button', { name: `Delete ${title}`, exact: true })
    .click()
  await expect(card).toHaveCount(0)
})
