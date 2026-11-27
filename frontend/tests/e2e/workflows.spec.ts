import { expect, test } from '@playwright/test'

test('lists all work types, searches assignments, and explains workflows', async ({
  page,
}) => {
  await page.goto('/workflows')
  await expect(page.getByRole('article')).toHaveCount(19)
  await expect(page.getByText('18 workflows', { exact: true })).toBeVisible()
  const bug = page.getByRole('article', {
    name: 'Bug / regression',
    exact: true,
  })
  await expect(
    bug.getByText('Diagnosis and regression testing', { exact: true }),
  ).toBeVisible()
  await bug.getByText('Workflow details', { exact: true }).click()
  await expect(
    bug.getByRole('heading', { name: 'Expected outputs' }),
  ).toBeVisible()
  await expect(
    bug.getByText('Capture the failure in a regression test', { exact: true }),
  ).toBeVisible()
  await expect(
    bug.getByRole('heading', { name: 'Approval points' }),
  ).toBeVisible()
  const search = page.getByRole('searchbox')
  await search.fill('regression')
  await expect(bug).toBeVisible()
  await expect(
    page.getByRole('article', { name: 'Documentation', exact: true }),
  ).not.toBeVisible()
  await search.fill('docs as code')
  await expect(
    page.getByRole('article', { name: 'Documentation', exact: true }),
  ).toBeVisible()
  await expect(bug).not.toBeVisible()
  await search.fill('no-such-work-type')
  await expect(page.getByText('No work types match your search.')).toBeVisible()
  await search.fill('')
  await expect(bug).toBeVisible()
})

test('recovers from catalogue load errors', async ({ page }) => {
  await page.route('**/api/v1/work-types/', (route) =>
    route.fulfill({
      status: 503,
      json: { detail: 'Catalogue temporarily unavailable.' },
    }),
  )
  await page.goto('/workflows')
  await expect(page.getByRole('alert')).toContainText(
    'Catalogue temporarily unavailable.',
  )
  await page.unroute('**/api/v1/work-types/')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('article')).toHaveCount(19)
})

test('keeps catalogue and details readable at narrow widths and enlarged text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/workflows')
  await expect(page.getByRole('article')).toHaveCount(19)
  const article = page.getByRole('article', {
    name: 'Dependency / framework / runtime upgrade',
    exact: true,
  })
  await article.getByText('Workflow details', { exact: true }).click()
  await expect(
    article.getByRole('heading', { name: 'Steps', exact: true }),
  ).toBeVisible()
  for (const fontSize of ['100%', '200%']) {
    await page.evaluate((value) => {
      document.documentElement.style.fontSize = value
    }, fontSize)
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > window.innerWidth + 1,
        )
        .map((element) => `${element.tagName}.${element.className}`),
    )
    expect(overflow).toEqual([])
  }
})
