import { expect, test } from '@playwright/test'
import type { WorkType } from '../../src/features/workflows/api'

test.afterEach(async ({ request }) => {
  const response = await request.get('/api/v1/work-types/')
  const workTypes: WorkType[] = await response.json()
  for (const workType of workTypes) {
    if (workType.assigned_workflow === workType.recommended_workflow) continue
    const { csrfToken } = await (await request.get('/api/v1/csrf/')).json()
    const reset = await request.patch(`/api/v1/work-types/${workType.key}/`, {
      headers: { 'X-CSRFToken': csrfToken },
      data: {
        assigned_workflow: workType.recommended_workflow,
        revision: workType.revision,
      },
    })
    expect(reset.ok()).toBe(true)
  }
})

test('lists work types alphabetically and searches assignments', async ({
  page,
}) => {
  await page.goto('/workflows')
  await expect(page.getByRole('article')).toHaveCount(19)
  await expect(page.getByText('18 workflows', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Accessibility improvement',
    'API / external integration',
    'Architecture / system design',
    'Bug / regression',
    'Build / CI / developer tooling',
    'Business rules / complex application logic',
    'Database schema / data migration',
    'Dependency / framework / runtime upgrade',
    'Documentation',
    'Feature / enhancement',
    'Infrastructure / configuration / release',
    'Performance / scalability',
    'Production incident / emergency fix',
    'Refactoring / code health',
    'Research / technical spike / prototype',
    'Security vulnerability / hardening',
    'Small change / routine maintenance',
    'Testing / QA improvement',
    'UI / UX change',
  ])
  await expect(page.getByText('Workflow details', { exact: true })).toHaveCount(
    0,
  )
  const bug = page.getByRole('article', {
    name: 'Bug / regression',
    exact: true,
  })
  await expect(
    bug.getByText('Assigned: Diagnosis and regression testing', {
      exact: true,
    }),
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

test('uses two columns when space permits and stays readable at narrow widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/workflows')
  const cards = page.getByRole('article')
  await expect(cards).toHaveCount(19)
  const firstWide = (await cards.nth(0).boundingBox())!
  const secondWide = (await cards.nth(1).boundingBox())!
  expect(Math.abs(firstWide.y - secondWide.y)).toBeLessThan(1)
  expect(secondWide.x).toBeGreaterThanOrEqual(firstWide.x + firstWide.width)
  await page.setViewportSize({ width: 320, height: 700 })
  const firstNarrow = (await cards.nth(0).boundingBox())!
  const secondNarrow = (await cards.nth(1).boundingBox())!
  expect(Math.abs(firstNarrow.x - secondNarrow.x)).toBeLessThan(1)
  expect(secondNarrow.y).toBeGreaterThanOrEqual(
    firstNarrow.y + firstNarrow.height,
  )
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

test('reassigns, cancels, restores recommendations, and persists after refresh', async ({
  page,
}) => {
  await page.goto('/workflows')
  const bug = page.getByRole('article', {
    name: 'Bug / regression',
    exact: true,
  })
  const select = bug.getByRole('combobox')
  const save = bug.getByRole('button', { name: 'Save', exact: true })
  await expect(select.getByRole('option')).toHaveCount(18)
  await expect(save).toBeDisabled()
  await select.selectOption('test-driven')
  await expect(bug.getByText('Unsaved change', { exact: true })).toBeVisible()
  await bug.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(select).toHaveValue('diagnose-regression')
  await select.selectOption('test-driven')
  await page.getByRole('searchbox').fill('no-such-type')
  await page.getByRole('searchbox').fill('')
  await expect(select).toHaveValue('test-driven')
  await expect(
    bug.getByText('Save to assign Test-driven development to this work type.', {
      exact: true,
    }),
  ).toBeVisible()
  await save.click()
  await expect(bug.getByRole('status')).toHaveText('Assignment saved.')
  await expect(
    bug.getByText('Custom assignment', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(select).toHaveValue('test-driven')
  await expect(
    page
      .getByRole('article', { name: 'Feature / enhancement', exact: true })
      .getByRole('combobox'),
  ).toHaveValue('spec-driven')
  await bug.getByRole('button', { name: 'Use recommended workflow' }).click()
  await expect(select).toHaveValue('diagnose-regression')
  await expect(
    bug.getByText('Assigned: Test-driven development', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(select).toHaveValue('test-driven')
  await bug.getByRole('button', { name: 'Use recommended workflow' }).click()
  await save.click()
  await expect(bug.getByRole('status')).toHaveText('Assignment saved.')
  await page.reload()
  await expect(select).toHaveValue('diagnose-regression')
})

test('retains a failed selection and disables duplicate saves while retrying', async ({
  page,
}) => {
  await page.goto('/workflows')
  const bug = page.getByRole('article', {
    name: 'Bug / regression',
    exact: true,
  })
  await bug.getByRole('combobox').selectOption('test-driven')
  await page.route('**/api/v1/work-types/bug/', (route) =>
    route.fulfill({
      status: 503,
      json: { detail: 'Could not save right now.' },
    }),
  )
  await bug.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(bug.getByRole('alert')).toContainText(
    'Could not save right now.',
  )
  await expect(bug.getByRole('combobox')).toHaveValue('test-driven')
  await page.unroute('**/api/v1/work-types/bug/')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/work-types/bug/', async (route) => {
    await gate
    await route.continue()
  })
  try {
    await bug.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      bug.getByRole('button', { name: 'Saving…', exact: true }),
    ).toBeDisabled()
    await expect(bug.getByRole('combobox')).toBeDisabled()
    await expect(
      bug.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeDisabled()
  } finally {
    release()
  }
  await expect(bug.getByRole('status')).toHaveText('Assignment saved.')
})

test('resolves conflicting saves across two tabs without losing the selection', async ({
  page,
  context,
}) => {
  await page.goto('/workflows')
  const other = await context.newPage()
  try {
    await other.goto('/workflows')
    const first = page.getByRole('article', {
      name: 'Feature / enhancement',
      exact: true,
    })
    const second = other.getByRole('article', {
      name: 'Feature / enhancement',
      exact: true,
    })
    await expect(second.getByRole('combobox')).toHaveValue('spec-driven')
    await first.getByRole('combobox').selectOption('test-driven')
    await first.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(first.getByRole('status')).toHaveText('Assignment saved.')
    await second.getByRole('combobox').selectOption('plan-execute')
    await second.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(second.getByRole('alert')).toContainText('changed elsewhere')
    await expect(
      second.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await expect(second.getByRole('combobox')).toHaveValue('plan-execute')
    await second.getByRole('button', { name: 'Reload assignment' }).click()
    await expect(
      second.getByText('Assigned: Test-driven development', { exact: true }),
    ).toBeVisible()
    await expect(second.getByRole('combobox')).toHaveValue('plan-execute')
    await second.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(second.getByRole('status')).toHaveText('Assignment saved.')
    await page.reload()
    await expect(first.getByRole('combobox')).toHaveValue('plan-execute')
  } finally {
    await other.close()
  }
})

test('supports keyboard reassignment and captures the management layout', async ({
  page,
}, testInfo) => {
  await page.goto('/workflows')
  const maintenance = page.getByRole('article', {
    name: 'Small change / routine maintenance',
    exact: true,
  })
  const select = maintenance.getByRole('combobox')
  await select.focus()
  await expect(select).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await expect(select).toHaveValue('spec-driven')
  await page.keyboard.press('Tab')
  await expect(
    maintenance.getByRole('button', { name: 'Save', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(maintenance.getByRole('status')).toHaveText('Assignment saved.')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('workflows-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('workflows-mobile.png') })
})
