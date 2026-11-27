import { expect, test } from '@playwright/test'

test('shows one DAG and its complete node requirements', async ({ page }) => {
  await page.goto('/workflows?tab=map&workflow=plan-execute')
  await expect(page.getByRole('tab', { name: 'Workflow map' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByText('1 of 15 mapped', { exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(4)
  await expect(
    page.getByText('4 steps · 3 transitions', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('3. Validate. 3 requirements.', { exact: true }).click()
  const inspector = page.getByRole('complementary', { name: '03 Validate' })
  await expect(
    inspector.getByRole('heading', { name: 'Before moving on' }),
  ).toBeVisible()
  await expect(
    inspector.getByText(/Verify technical accuracy, examples/),
  ).toBeVisible()
  await expect(inspector.getByText('For documentation changes.')).toBeVisible()
  await inspector
    .getByRole('button', { name: 'Review and accept Checks passed' })
    .click()
  await expect(
    page.getByRole('complementary', { name: '04 Review and accept' }),
  ).toContainText('Workflow complete')
  await page.getByRole('button', { name: 'Ordered steps', exact: true }).click()
  const steps = page.getByRole('list', { name: 'Workflow steps' })
  await expect(steps.locator(':scope > li')).toHaveCount(4)
  await expect(steps).toContainText('Approve the brief plan.')
  await expect(steps).toContainText('applicable documentation builds.')
})

test('switches maps and preserves tab selection through history and refresh', async ({
  page,
}) => {
  await page.goto('/workflows')
  await page.getByRole('tab', { name: 'Workflow map' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(4)
  await page
    .getByRole('combobox', { name: 'Workflow', exact: true })
    .selectOption('spec-driven')
  await expect(
    page.getByText('Map not authored yet.', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await page.goBack()
  await expect(
    page.getByRole('combobox', { name: 'Workflow', exact: true }),
  ).toHaveValue('plan-execute')
  await expect(page.locator('.react-flow__node')).toHaveCount(4)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Workflow map' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.goBack()
  await expect(page.getByRole('tab', { name: 'Assignments' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('article')).toHaveCount(19)
})

test('recovers from graph load errors', async ({ page }) => {
  await page.route('**/api/v1/workflows/plan-execute/graph/', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Map unavailable.' } }),
  )
  await page.goto('/workflows?tab=map&workflow=plan-execute')
  await expect(page.getByRole('alert')).toContainText('Map unavailable.')
  await page.unroute('**/api/v1/workflows/plan-execute/graph/')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(4)
})
