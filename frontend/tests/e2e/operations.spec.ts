import { expect, test } from '@playwright/test'

test('selects a flow, inspects evidence, and preserves conversation drafts across tabs', async ({
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
