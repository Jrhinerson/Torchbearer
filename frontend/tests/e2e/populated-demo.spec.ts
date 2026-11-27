import { expect, test } from '@playwright/test'

test('renders 40 mixed tasks and discovery evidence without allowing execution', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(
    page.getByRole('status').filter({ hasText: 'Read-only demo' }),
  ).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(40)
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', {
      name: 'Open Fix duplicate webhook deliveries',
      exact: true,
    })
    .click()
  const workspace = page.getByRole('dialog', {
    name: 'Fix duplicate webhook deliveries',
    exact: true,
  })
  await expect(
    workspace.getByRole('button', {
      name: 'Approve implementation & start Code Review',
      exact: true,
    }),
  ).toBeDisabled()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: testInfo.outputPath('populated-operations-desktop.png'),
    fullPage: true,
  })
  await page
    .getByRole('button', { name: 'Open Choose queue backend', exact: true })
    .click()
  const discovery = page.getByRole('dialog', {
    name: 'Choose queue backend',
    exact: true,
  })
  await expect(
    discovery.getByRole('region', { name: 'Decision artifact' }),
  ).toContainText('SQLite')
  await page.setViewportSize({ width: 320, height: 800 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('populated-discovery-mobile.png'),
    fullPage: true,
  })
  const csrf = (await (await page.request.get('/api/v1/csrf/')).json())
    .csrfToken
  expect(
    (
      await page.request.post('/api/v1/tasks/', {
        headers: { 'X-CSRFToken': csrf },
        data: { title: 'Forbidden demo mutation' },
      })
    ).status(),
  ).toBe(403)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('tab', { name: 'Activity', exact: true }).click()
  await expect(
    page
      .getByRole('region', { name: 'Operations activity' })
      .getByRole('listitem'),
  ).not.toHaveCount(0)
})
