import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function openComposer(page: Page) {
  const trigger = page.getByRole('button', { name: 'New Task', exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'New task', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Title', { exact: false })).toBeFocused()
  return dialog
}

test('shows six workflow columns and creates a task through the popup', async ({
  page,
}, testInfo) => {
  const title = `Define acceptance criteria ${Date.now()}`
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Backlog',
    'Plan',
    'Integrate',
    'Test',
    'Code Review',
    'Final Approval',
  ])
  await expect(
    page.getByRole('heading', { name: 'Build with intention.' }),
  ).toHaveCount(0)
  await expect(page.getByRole('dialog')).not.toBeVisible()
  const backlog = page.getByRole('region', { name: 'Backlog', exact: true })
  await expect(
    backlog.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeVisible()
  const dialog = await openComposer(page)
  await dialog.getByLabel('Title', { exact: false }).fill(title)
  await dialog
    .getByLabel('Description', { exact: false })
    .fill('Decide what success looks like before implementation.')
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeFocused()
  await expect(backlog.getByRole('article', { name: title })).toBeVisible()
  await page.reload()
  await expect(backlog.getByRole('article', { name: title })).toContainText(
    'Decide what success looks like',
  )
  await page.screenshot({
    path: testInfo.outputPath('board-desktop.png'),
    fullPage: true,
  })
})

test('supports Cancel, Escape, and close while retaining a draft', async ({
  page,
}) => {
  await page.goto('/')
  const dialog = await openComposer(page)
  await dialog.getByLabel('Title', { exact: false }).fill('Keep this draft')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeFocused()

  await openComposer(page)
  await expect(dialog.getByLabel('Title', { exact: false })).toHaveValue(
    'Keep this draft',
  )
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeFocused()

  await openComposer(page)
  await dialog.getByRole('button', { name: 'Close new task' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeFocused()
  await expect(
    page.getByRole('article', { name: 'Keep this draft' }),
  ).toHaveCount(0)
})

test('preserves the popup and draft when creation fails', async ({ page }) => {
  await page.goto('/')
  const dialog = await openComposer(page)
  await page.route('**/api/v1/tasks/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 400,
        json: { title: ['Please make the task title more specific.'] },
      })
    } else await route.continue()
  })
  const title = 'Preserve this draft'
  await dialog.getByLabel('Title', { exact: false }).fill(title)
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveText(
    'Please make the task title more specific.',
  )
  await expect(dialog.getByLabel('Title', { exact: false })).toHaveValue(title)
  await expect(page.getByRole('article', { name: title })).toHaveCount(0)
})

test('recovers from a failed initial connection', async ({ page }) => {
  await page.route('**/api/v1/tasks/', (route) => route.abort('failed'))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    'Could not reach the local service',
  )
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeDisabled()
  await page.unroute('**/api/v1/tasks/')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('fits the popup and scrolls board columns on a narrow screen', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const title = `Plan a focused mobile task ${Date.now()}`
  await page.goto('/')
  const dialog = await openComposer(page)
  await dialog.getByLabel('Title', { exact: false }).fill(title)
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: testInfo.outputPath('task-popup-mobile.png'),
    fullPage: true,
  })
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('article', { name: title })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const scrollRegion = page.getByRole('region', { name: 'Kanban columns' })
  expect(
    await scrollRegion.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('heading', { name: 'Final Approval', exact: true })
    .scrollIntoViewIfNeeded()
  await expect(
    page.getByRole('heading', { name: 'Final Approval', exact: true }),
  ).toBeInViewport()
  await page.screenshot({
    path: testInfo.outputPath('board-mobile.png'),
    fullPage: true,
  })
})

test('cancels deletion and then deletes a task persistently', async ({
  page,
}) => {
  const title = `Delete this backlog task ${Date.now()}`
  await page.goto('/')
  const dialog = await openComposer(page)
  await dialog.getByLabel('Title', { exact: false }).fill(title)
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await expect(card).toBeVisible()
  page.once('dialog', (prompt) => prompt.dismiss())
  await card
    .getByRole('button', { name: `Delete ${title}`, exact: true })
    .click()
  await page.reload()
  await expect(card).toBeVisible()
  page.once('dialog', (prompt) => prompt.accept())
  await card
    .getByRole('button', { name: `Delete ${title}`, exact: true })
    .click()
  await expect(card).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeEnabled()
  await expect(card).toHaveCount(0)
})

test('keeps a task when deletion fails and allows retrying', async ({
  page,
}) => {
  const title = `Retry task deletion ${Date.now()}`
  await page.goto('/')
  const dialog = await openComposer(page)
  await dialog.getByLabel('Title', { exact: false }).fill(title)
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await expect(card).toBeVisible()
  await page.route('**/api/v1/tasks/*/', (route) =>
    route.fulfill({
      status: 500,
      json: { detail: 'Could not delete this task. Please try again.' },
    }),
  )
  page.once('dialog', (prompt) => prompt.accept())
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
  page.once('dialog', (prompt) => prompt.accept())
  await card
    .getByRole('button', { name: `Delete ${title}`, exact: true })
    .click()
  await expect(card).toHaveCount(0)
})
