import { expect, test } from '@playwright/test'

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
