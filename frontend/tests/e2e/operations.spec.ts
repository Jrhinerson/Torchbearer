import { expect, test } from '@playwright/test'
import type { Task } from '../../src/features/tasks/api'

test('uses a selected discovery workflow through decision acceptance', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000)
  await page.goto('/')
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  const composer = page.getByRole('dialog', { name: 'New task', exact: true })
  const title = 'Compare queue backends'
  await composer.getByLabel('Title', { exact: false }).fill(title)
  await composer
    .getByLabel('Work type', { exact: true })
    .selectOption('research')
  await expect(composer).toContainText('Discovery and design review')
  await composer.getByLabel('Approach', { exact: true }).selectOption('hybrid')
  await composer.getByRole('button', { name: /^Project optional/ }).click()
  await composer
    .getByRole('button', {
      name: 'Select Browser fixture repository',
      exact: true,
    })
    .click()
  await composer.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await expect(card).toContainText('Discovery and design review')
  await card
    .getByRole('button', { name: `Expand ${title}`, exact: true })
    .click()
  await card
    .getByRole('button', { name: 'Start planning', exact: true })
    .click()
  await card.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  const workspace = page.getByRole('dialog', { name: title, exact: true })
  const approve = (name: string) =>
    workspace.getByRole('button', { name, exact: true })
  await expect(approve('Approve plan & start investigation')).toBeEnabled({
    timeout: 20000,
  })
  await approve('Approve plan & start investigation').click()
  await expect(approve('Approve findings & start decision review')).toBeEnabled(
    { timeout: 20000 },
  )
  await expect(
    workspace.getByRole('region', { name: 'Decision artifact' }),
  ).toContainText('Local queue')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: testInfo.outputPath('operations-discovery-desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 320, height: 800 })
  await expect(
    workspace.getByRole('region', { name: 'Decision artifact' }),
  ).toContainText('Local queue')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('operations-discovery-mobile.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await approve('Approve findings & start decision review').click()
  await expect(approve('Approve decision review & continue')).toBeEnabled({
    timeout: 20000,
  })
  await approve('Approve decision review & continue').click()
  await expect(approve('Accept decision')).toBeEnabled({ timeout: 20000 })
  await approve('Accept decision').click()
  await expect(
    page
      .getByRole('region', { name: 'Done', exact: true })
      .getByRole('article', { name: title }),
  ).toBeVisible()
})

test('preserves selected evidence and drafts across tabs, focus mode, and failed refreshes', async ({
  page,
}) => {
  await page.goto('/')
  const token = (await (await page.request.get('/api/v1/csrf/')).json())
    .csrfToken
  const repositories = await (
    await page.request.get('/api/v1/repositories/')
  ).json()
  const title = `Operations evidence ${Date.now()}`
  const created = await (
    await page.request.post('/api/v1/tasks/', {
      headers: { 'X-CSRFToken': token },
      data: { title, repository: repositories[0].id },
    })
  ).json()
  await page.request.post(`/api/v1/tasks/${created.id}/actions/`, {
    headers: { 'X-CSRFToken': token },
    data: { action: 'start', revision: created.revision },
  })
  await page.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  const workspace = page.getByRole('dialog', { name: title, exact: true })
  await expect(
    workspace.getByRole('tab', { name: 'Flow', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(
    workspace.getByRole('button', {
      name: 'Approve plan & start Integrate',
      exact: true,
    }),
  ).toBeEnabled({ timeout: 20000 })
  await expect(
    workspace.getByRole('complementary', { name: 'Task evidence and actions' }),
  ).toContainText('Decision required')
  await workspace
    .getByRole('tab', { name: 'Conversation', exact: true })
    .click()
  await workspace
    .getByLabel('Message your planning agent')
    .fill('Keep this draft')
  await workspace.getByRole('tab', { name: 'Flow', exact: true }).click()
  await workspace
    .getByRole('tab', { name: 'Conversation', exact: true })
    .click()
  await expect(workspace.getByLabel('Message your planning agent')).toHaveValue(
    'Keep this draft',
  )
  await workspace
    .getByRole('button', { name: 'Focus workspace', exact: true })
    .click()
  await expect(workspace.getByLabel('Message your planning agent')).toHaveValue(
    'Keep this draft',
  )
  await workspace
    .getByRole('button', { name: 'Return to board', exact: true })
    .click()
  await expect(workspace.getByLabel('Message your planning agent')).toHaveValue(
    'Keep this draft',
  )
  const flowUrl = `**/api/v1/tasks/${created.id}/flow/`
  await page.route(flowUrl, (route) =>
    route.fulfill({ status: 500, json: { detail: 'Flow refresh failed' } }),
  )
  await expect(workspace.getByRole('alert')).toContainText(
    'Flow refresh failed',
  )
  await expect(
    workspace.getByRole('button', {
      name: 'Approve plan & start Integrate',
      exact: true,
    }),
  ).toBeDisabled()
  await expect(workspace.getByLabel('Message your planning agent')).toHaveValue(
    'Keep this draft',
  )
  await page.unroute(flowUrl)
  await workspace
    .getByRole('button', { name: 'Reload runs', exact: true })
    .click()
  await expect(
    workspace.getByRole('button', {
      name: 'Approve plan & start Integrate',
      exact: true,
    }),
  ).toBeEnabled()
  await page.getByRole('tab', { name: 'Activity', exact: true }).click()
  const feed = page.getByRole('region', { name: 'Operations activity' })
  await expect(
    feed.getByRole('button', { name: title, exact: true }).first(),
  ).toBeVisible()
  await page
    .getByRole('searchbox', { name: 'Search tasks' })
    .fill('No matching selection 8c52')
  await expect(
    page.getByRole('region', { name: 'Operations activity' }),
  ).toContainText('No recorded activity matches these filters.')
  await expect(workspace).toBeVisible()
  await expect(
    workspace.getByRole('button', {
      name: 'Approve plan & start Integrate',
      exact: true,
    }),
  ).toBeEnabled()
  await expect(workspace.getByLabel('Message your planning agent')).toHaveValue(
    'Keep this draft',
  )
})

test('ignores delayed flow responses after selecting another task', async ({
  page,
}) => {
  await page.goto('/')
  const csrf = (await (await page.request.get('/api/v1/csrf/')).json())
    .csrfToken
  const repositories = await (
    await page.request.get('/api/v1/repositories/')
  ).json()
  const tasks: Task[] = []
  for (const name of ['Delayed selection', 'Current selection']) {
    const task = await (
      await page.request.post('/api/v1/tasks/', {
        headers: { 'X-CSRFToken': csrf },
        data: {
          title: `${name} ${Date.now()}`,
          repository: repositories[0].id,
        },
      })
    ).json()
    await page.request.post(`/api/v1/tasks/${task.id}/actions/`, {
      headers: { 'X-CSRFToken': csrf },
      data: { action: 'start', revision: task.revision },
    })
    tasks.push(task)
  }
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  let intercept = true
  await page.route(`**/api/v1/tasks/${tasks[0].id}/flow/`, async (route) => {
    if (!intercept) return route.continue()
    intercept = false
    const response = await route.fetch()
    await barrier
    await route.fulfill({ response }).catch(() => {})
  })
  const requested = page.waitForRequest((request) =>
    request.url().endsWith(`/tasks/${tasks[0].id}/flow/`),
  )
  await page
    .getByRole('button', { name: `Open ${tasks[0].title}`, exact: true })
    .click()
  await requested
  await page
    .getByRole('button', { name: `Open ${tasks[1].title}`, exact: true })
    .click()
  release()
  const selected = page.getByRole('dialog', {
    name: tasks[1].title,
    exact: true,
  })
  await expect(
    selected.getByRole('button', {
      name: 'Approve plan & start Integrate',
      exact: true,
    }),
  ).toBeEnabled({ timeout: 20000 })
  await expect(
    page.getByRole('dialog', { name: tasks[0].title, exact: true }),
  ).toHaveCount(0)
  await expect(selected).not.toContainText(tasks[0].title)
})

test('shows operations groups and filters cards and counts together', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Operations | Torchbearer')
  const board = page.getByRole('region', { name: 'Operations columns' })
  await expect(board.getByRole('heading', { level: 2 })).toHaveText([
    'Backlog',
    'Active',
    'Needs you',
    'Done',
  ])
  await expect(
    page.getByRole('region', { name: 'Agent task activity' }),
  ).toBeVisible()
  await page
    .getByRole('searchbox', { name: 'Search tasks' })
    .fill('No matching task 5f9e83')
  await expect(board.getByRole('article')).toHaveCount(0)
  await expect(
    page.getByText('0 running · 0 queued · 0 need you'),
  ).toBeVisible()
  await page.setViewportSize({ width: 320, height: 800 })
  await expect(
    page.getByRole('heading', { name: 'Operations', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})
