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
  await backlog
    .getByRole('article', { name: title })
    .getByRole('button', { name: `Expand ${title}`, exact: true })
    .click()
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

for (const width of [1280, 390]) {
  test(`collapses cards independently to title and project at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: /^Collapse / })).toHaveCount(
      0,
    )
    const title = `Collapsible task ${width} ${Date.now()}`
    const description = 'Keep the details and actions available when expanded.'
    const composer = await openComposer(page)
    await composer.getByLabel('Title', { exact: false }).fill(title)
    await composer.getByLabel('Description', { exact: false }).fill(description)
    await composer.getByRole('button', { name: /^Project optional/ }).click()
    await composer
      .getByRole('button', {
        name: 'Select Browser fixture repository',
        exact: true,
      })
      .click()
    await composer.getByRole('button', { name: 'Add to backlog' }).click()
    const card = page.getByRole('article', { name: title, exact: true })
    await expect(card.getByText(description, { exact: true })).not.toBeVisible()
    await card
      .getByRole('button', { name: `Expand ${title}`, exact: true })
      .press('Enter')
    await expect(card.getByText(description, { exact: true })).toBeVisible()

    const otherTitle = `Independent card ${width} ${Date.now()}`
    await openComposer(page)
    await composer.getByLabel('Title', { exact: false }).fill(otherTitle)
    await composer.getByRole('button', { name: /^Project optional/ }).click()
    await composer
      .getByRole('button', { name: 'No project', exact: false })
      .click()
    await composer.getByRole('button', { name: 'Add to backlog' }).click()
    const other = page.getByRole('article', { name: otherTitle, exact: true })
    await expect(other.locator('.task-project')).toHaveText('No project')
    await other
      .getByRole('button', { name: `Expand ${otherTitle}`, exact: true })
      .click()

    const refreshed = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/tasks/') &&
        response.request().method() === 'GET',
    )
    await card
      .getByRole('button', { name: `Collapse ${title}`, exact: true })
      .press('Enter')
    await refreshed
    const expand = card.getByRole('button', {
      name: `Expand ${title}`,
      exact: true,
    })
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expect(card.getByRole('button')).toHaveCount(2)
    await expect(
      card.getByRole('button', { name: `Open ${title}`, exact: true }),
    ).toBeVisible()
    await expect(card.locator('.task-project')).toHaveText(
      '▱ Browser fixture repository',
    )
    await expect(card.getByText(description, { exact: true })).not.toBeVisible()
    await expect(card.locator('.card-workflow')).not.toBeVisible()
    await expect(card.locator('.task-footer')).not.toBeVisible()
    await expect(
      other.getByRole('button', {
        name: `Collapse ${otherTitle}`,
        exact: true,
      }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(
      other.getByRole('button', { name: `Delete ${otherTitle}`, exact: true }),
    ).toBeVisible()
    await card.scrollIntoViewIfNeeded()
    expect(
      await card.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('collapsed-task-card.png'),
      fullPage: true,
    })

    await card
      .getByRole('button', { name: `Open ${title}`, exact: true })
      .click()
    const settings = page.getByRole('dialog', { name: title, exact: true })
    await expect(settings.getByLabel('Approach', { exact: true })).toBeVisible()
    await settings.getByRole('button', { name: 'Close task settings' }).click()
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expand.press('Space')
    await expect(
      card.getByRole('button', { name: `Collapse ${title}`, exact: true }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(card.getByText(description, { exact: true })).toBeVisible()
    await expect(
      card.getByRole('button', { name: 'Start planning', exact: true }),
    ).toBeVisible()
    await expect(
      card.getByRole('button', { name: `Delete ${title}`, exact: true }),
    ).toBeVisible()
    const expandedRefresh = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/tasks/') &&
        response.request().method() === 'GET',
    )
    await expandedRefresh
    await expect(
      card.getByRole('button', { name: `Collapse ${title}`, exact: true }),
    ).toHaveAttribute('aria-expanded', 'true')
    await page.reload()
    await expect(
      card.getByRole('button', { name: `Expand ${title}`, exact: true }),
    ).toHaveAttribute('aria-expanded', 'false')
    await expect(card.getByText(description, { exact: true })).not.toBeVisible()
    await expect(
      other.getByRole('button', { name: `Expand ${otherTitle}`, exact: true }),
    ).toHaveAttribute('aria-expanded', 'false')
  })
}

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
  await card
    .getByRole('button', { name: `Expand ${title}`, exact: true })
    .click()
  page.once('dialog', (prompt) => prompt.dismiss())
  await card
    .getByRole('button', { name: `Delete ${title}`, exact: true })
    .click()
  await page.reload()
  await expect(card).toBeVisible()
  await card
    .getByRole('button', { name: `Expand ${title}`, exact: true })
    .click()
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
  await card
    .getByRole('button', { name: `Expand ${title}`, exact: true })
    .click()
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
