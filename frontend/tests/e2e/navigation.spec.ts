import { expect, test } from '@playwright/test'

test('navigates between application pages with browser history', async ({
  page,
}) => {
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  const kanban = navigation.getByRole('link', { name: 'Kanban', exact: true })
  const workflows = navigation.getByRole('link', {
    name: 'Workflows',
    exact: true,
  })
  const settings = navigation.getByRole('link', {
    name: 'Settings',
    exact: true,
  })
  await expect(navigation.getByRole('link')).toHaveText([
    'Kanban',
    'Workflows',
    'Settings',
  ])
  await expect(kanban).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('region', { name: 'Kanban columns' }),
  ).toBeVisible()

  await workflows.click()
  await expect(page).toHaveURL('/workflows')
  await expect(page).toHaveTitle('Workflows | Torchbearer')
  await expect(
    page.getByRole('heading', { name: 'Workflows', exact: true }),
  ).toBeVisible()
  await expect(workflows).toHaveAttribute('aria-current', 'page')
  await expect(kanban).not.toHaveAttribute('aria-current')
  await expect(
    page.getByRole('region', { name: 'Kanban columns' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('main', { name: 'Workflows', exact: true }),
  ).toBeFocused()

  await settings.click()
  await expect(page).toHaveURL('/settings')
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible()
  await expect(settings).toHaveAttribute('aria-current', 'page')

  await page.goBack()
  await expect(page).toHaveURL('/workflows')
  await expect(workflows).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('heading', { name: 'Workflows', exact: true }),
  ).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL('/settings')
  await expect(settings).toHaveAttribute('aria-current', 'page')

  await kanban.click()
  await expect(page).toHaveURL('/')
  await expect(kanban).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeEnabled()
  await settings.click()
  await page
    .getByRole('link', { name: 'Torchbearer home', exact: true })
    .click()
  await expect(page).toHaveURL('/')
  await expect(kanban).toHaveAttribute('aria-current', 'page')
})

for (const label of ['Workflows', 'Settings']) {
  test(`opens and refreshes the ${label} page directly`, async ({ page }) => {
    await page.goto(`/${label.toLowerCase()}`)
    await page.reload()
    await expect(page).toHaveTitle(`${label} | Torchbearer`)
    await expect(
      page.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible()
    if (label === 'Workflows') {
      await expect(page.getByRole('article')).toHaveCount(19)
    } else {
      await expect(
        page.getByRole('heading', { name: 'Connections' }),
      ).toBeVisible()
    }
    await expect(
      page
        .getByRole('navigation')
        .getByRole('link', { name: label, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  })
}

test('keeps left navigation visible and keyboard accessible at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  for (const link of await navigation.getByRole('link').all()) {
    await expect(link).toBeVisible()
    const bounds = (await link.boundingBox())!
    expect(bounds.width).toBeGreaterThanOrEqual(44)
    expect(bounds.height).toBeGreaterThanOrEqual(44)
  }
  const navBounds = (await navigation.boundingBox())!
  const mainBounds = (await page.getByRole('main').boundingBox())!
  expect(navBounds.x + navBounds.width).toBeLessThanOrEqual(mainBounds.x)

  const workflows = navigation.getByRole('link', {
    name: 'Workflows',
    exact: true,
  })
  await workflows.focus()
  await expect(workflows).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/workflows')
  await expect(
    page.getByRole('main', { name: 'Workflows', exact: true }),
  ).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})
