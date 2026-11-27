import { expect, test } from '@playwright/test'
import type {
  WorkflowGraph,
  WorkflowGraphDetail,
} from '../../src/features/workflows/api'

let original: WorkflowGraph | null = null

test.beforeEach(async ({ request }) => {
  const detail: WorkflowGraphDetail = await (
    await request.get('/api/v1/workflows/plan-execute/graph/')
  ).json()
  original = detail.graph
})

test.afterEach(async ({ request }) => {
  const detail: WorkflowGraphDetail = await (
    await request.get('/api/v1/workflows/plan-execute/graph/')
  ).json()
  if (JSON.stringify(detail.graph) === JSON.stringify(original)) return
  const { csrfToken } = await (await request.get('/api/v1/csrf/')).json()
  const reset = await request.patch('/api/v1/workflows/plan-execute/graph/', {
    headers: { 'X-CSRFToken': csrfToken },
    data: { graph: original, revision: detail.revision },
  })
  expect(reset.ok()).toBe(true)
})

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

test('edits requirements, applicability, outputs and transitions and persists after refresh', async ({
  page,
  request,
}) => {
  await page.goto('/workflows?tab=map&workflow=plan-execute')
  await page.getByLabel('3. Validate. 3 requirements.', { exact: true }).click()
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click()
  const inspector = page.getByRole('complementary', { name: /^\d{2} / })
  await expect(
    page.getByRole('combobox', { name: 'Workflow', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Save workflow', exact: true }),
  ).toBeDisabled()
  await inspector
    .getByRole('textbox', { name: 'Node title', exact: true })
    .fill('Validate evidence')
  await inspector
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Verify the change and retain the agreed evidence.')
  await inspector
    .getByRole('button', { name: '+ Add requirement', exact: true })
    .click()
  const added = inspector.locator('.workflow-requirement-editor').last()
  await added
    .getByRole('textbox', { name: 'Requirement description', exact: true })
    .fill('Verify the release notes.')
  await added
    .getByRole('combobox', { name: 'Requirement kind' })
    .selectOption('validation')
  await added
    .getByRole('combobox', { name: 'Applies', exact: true })
    .selectOption('when_relevant')
  await expect(
    page.getByRole('button', { name: 'Save workflow', exact: true }),
  ).toBeDisabled()
  await added
    .getByRole('textbox', { name: 'When does this apply?' })
    .fill('When the change affects a release.')
  await inspector
    .locator('summary')
    .filter({ hasText: /^Expected outputs$/ })
    .click()
  await inspector
    .getByRole('textbox', { name: 'Output 1', exact: true })
    .fill('Reviewed validation evidence')
  await inspector
    .getByRole('textbox', { name: 'Transition label 1', exact: true })
    .fill('Evidence accepted')
  await expect(
    inspector
      .getByRole('combobox', { name: 'Next step 1', exact: true })
      .getByRole('option', { name: 'Define scope', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click()
  await expect(page.getByText('Workflow saved.', { exact: true })).toBeVisible()
  const saved: WorkflowGraphDetail = await (
    await request.get('/api/v1/workflows/plan-execute/graph/')
  ).json()
  expect(
    saved.graph?.nodes
      .find((node) => node.id === 'validate')
      ?.requirements.at(-1)?.applicability_note,
  ).toBe('When the change affects a release.')
  await page.reload()
  await page
    .getByLabel('3. Validate evidence. 4 requirements.', { exact: true })
    .click()
  await expect(
    page.getByRole('complementary', { name: /^\d{2} / }),
  ).toContainText('Verify the release notes.')
  await expect(
    page.getByRole('complementary', { name: /^\d{2} / }),
  ).toContainText('Reviewed validation evidence')
  await expect(
    page.getByRole('complementary', { name: /^\d{2} / }),
  ).toContainText('Evidence accepted')
})

test('adds and removes a step with explicit connection review', async ({
  page,
}) => {
  await page.goto('/workflows?tab=map&workflow=plan-execute')
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click()
  await page.getByRole('button', { name: '+ Add step', exact: true }).click()
  const inspector = page.getByRole('complementary', { name: /^\d{2} / })
  await expect(
    page.getByRole('button', { name: 'Save workflow', exact: true }),
  ).toBeDisabled()
  await inspector
    .getByRole('textbox', { name: 'Node title', exact: true })
    .fill('Release notes')
  await inspector
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Prepare the release notes.')
  await inspector
    .getByRole('textbox', { name: 'Requirement description', exact: true })
    .fill('Release notes reviewed.')
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click()
  await expect(page.getByText('Workflow saved.', { exact: true })).toBeVisible()
  await page.reload()
  await page
    .getByLabel('5. Release notes. 1 requirements.', { exact: true })
    .click()
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click()
  await page.getByRole('button', { name: 'Remove step', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Remove Release notes?' })
  await expect(dialog).toContainText(
    'Review and accept → Release notes: Requirements met',
  )
  await dialog.getByRole('button', { name: 'Remove step', exact: true }).click()
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click()
  await expect(page.getByText('Workflow saved.', { exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(4)
})

test('retains the draft after a failed save and retries successfully', async ({
  page,
}) => {
  await page.goto('/workflows?tab=map&workflow=plan-execute')
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Node title', exact: true })
    .fill('Scope with evidence')
  await page.route('**/api/v1/workflows/plan-execute/graph/', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 503,
          json: { detail: 'Saving temporarily unavailable.' },
        })
      : route.continue(),
  )
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Saving temporarily unavailable.',
  )
  await expect(
    page.getByRole('textbox', { name: 'Node title', exact: true }),
  ).toHaveValue('Scope with evidence')
  await page.unroute('**/api/v1/workflows/plan-execute/graph/')
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click()
  await expect(page.getByText('Workflow saved.', { exact: true })).toBeVisible()
})

test('compares conflicting saves without losing the draft', async ({
  page,
  context,
}) => {
  await page.goto('/workflows?tab=map&workflow=plan-execute')
  const other = await context.newPage()
  try {
    await other.goto('/workflows?tab=map&workflow=plan-execute')
    for (const tab of [page, other])
      await tab
        .getByRole('button', { name: 'Edit workflow', exact: true })
        .click()
    await page
      .getByRole('textbox', { name: 'Node title', exact: true })
      .fill('Saved scope from first tab')
    await other
      .getByRole('textbox', { name: 'Node title', exact: true })
      .fill('Draft scope from second tab')
    await page
      .getByRole('button', { name: 'Save workflow', exact: true })
      .click()
    await expect(
      page.getByText('Workflow saved.', { exact: true }),
    ).toBeVisible()
    await other
      .getByRole('button', { name: 'Save workflow', exact: true })
      .click()
    await expect(other.getByRole('alert')).toContainText('changed elsewhere')
    await expect(
      other.getByRole('textbox', { name: 'Node title', exact: true }),
    ).toHaveValue('Draft scope from second tab')
    await expect(
      other.getByRole('button', { name: 'Save workflow', exact: true }),
    ).toBeDisabled()
    await other
      .getByRole('button', { name: 'Load latest to compare', exact: true })
      .click()
    const comparison = other.locator('.workflow-comparison')
    await expect(comparison).toContainText('Saved scope from first tab')
    await expect(comparison).toContainText('Draft scope from second tab')
    await other
      .getByRole('button', {
        name: 'Keep draft against latest revision',
        exact: true,
      })
      .click()
    await other
      .getByRole('button', { name: 'Save workflow', exact: true })
      .click()
    await expect(
      other.getByText('Workflow saved.', { exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByLabel('1. Draft scope from second tab. 3 requirements.', {
        exact: true,
      }),
    ).toBeVisible()
  } finally {
    await other.close()
  }
})

test('guards tab, page and browser-back navigation with a single draft', async ({
  page,
}) => {
  await page.goto('/workflows')
  await page.getByRole('tab', { name: 'Workflow map', exact: true }).click()
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Node title', exact: true })
    .fill('Unsaved scope')
  await page.getByRole('tab', { name: 'Assignments', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Keep editing', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Node title', exact: true }),
  ).toHaveValue('Unsaved scope')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Keep editing', exact: true })
    .click()
  await page.goBack()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Keep editing', exact: true })
    .click()
  await expect(page).toHaveURL(/tab=map/)
  await expect(
    page.getByRole('textbox', { name: 'Node title', exact: true }),
  ).toHaveValue('Unsaved scope')
  await page.goBack()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click()
  await expect(
    page.getByRole('tab', { name: 'Assignments', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.goForward()
  await expect(
    page.getByLabel('1. Define scope. 3 requirements.', { exact: true }),
  ).toBeVisible()
})

test('supports keyboard selection, node movement and focus restoration', async ({
  page,
  request,
}) => {
  await page.goto('/workflows')
  await page.getByRole('tab', { name: 'Assignments', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(
    page.getByRole('tab', { name: 'Workflow map', exact: true }),
  ).toBeFocused()
  const validate = page.getByLabel('3. Validate. 3 requirements.', {
    exact: true,
  })
  await validate.focus()
  await validate.press('Enter')
  await expect(
    page.getByRole('complementary', { name: '03 Validate' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Node title', exact: true }),
  ).toBeFocused()
  const before: WorkflowGraphDetail = await (
    await request.get('/api/v1/workflows/plan-execute/graph/')
  ).json()
  await validate.focus()
  await validate.press('ArrowRight')
  await expect(
    page.getByRole('button', { name: 'Save workflow', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click()
  await expect(page.getByText('Workflow saved.', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Edit workflow', exact: true }),
  ).toBeFocused()
  const after: WorkflowGraphDetail = await (
    await request.get('/api/v1/workflows/plan-execute/graph/')
  ).json()
  expect(
    after.graph!.nodes.find((node) => node.id === 'validate')!.position.x,
  ).toBeGreaterThan(
    before.graph!.nodes.find((node) => node.id === 'validate')!.position.x,
  )
  await page
    .getByRole('button', { name: 'Close node requirements', exact: true })
    .click()
  await expect(validate).toBeFocused()
  await expect(
    page.getByRole('complementary', { name: '03 Validate' }),
  ).not.toBeVisible()
})

test('requires connected steps and repairs transitions through the keyboard form', async ({
  page,
}) => {
  await page.goto('/workflows?tab=map&workflow=plan-execute')
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click()
  const inspector = page.getByRole('complementary', { name: /^\d{2} / })
  await inspector
    .getByRole('button', { name: 'Remove transition 1', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Save workflow', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByText('Connect every step to the entry step.', { exact: true }),
  ).toBeVisible()
  await inspector
    .getByRole('button', { name: '+ Add transition', exact: true })
    .click()
  await inspector
    .getByRole('textbox', { name: 'Transition label 1', exact: true })
    .fill('Plan approved again')
  await expect(
    page.getByRole('button', { name: 'Save workflow', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Arrange', exact: true }).click()
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click()
  await expect(page.getByText('Workflow saved.', { exact: true })).toBeVisible()
  await expect(
    page
      .getByRole('complementary', { name: '01 Define scope' })
      .getByText('Plan approved again', { exact: true }),
  ).toBeVisible()
})

test('disables editing and navigation during a pending save', async ({
  page,
}) => {
  await page.goto('/workflows?tab=map&workflow=plan-execute')
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Node title', exact: true })
    .fill('Scope for pending save')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/workflows/plan-execute/graph/', async (route) => {
    if (route.request().method() === 'PATCH') await gate
    await route.continue()
  })
  try {
    await page
      .getByRole('button', { name: 'Save workflow', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Saving…', exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByRole('textbox', { name: 'Node title', exact: true }),
    ).toBeDisabled()
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(
      page.getByText('Wait for the current request to finish before leaving.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(page).toHaveURL(/tab=map/)
  } finally {
    release()
  }
  await expect(page.getByText('Workflow saved.', { exact: true })).toBeVisible()
})

test('keeps desktop and narrow layouts usable in both themes and at text zoom', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/workflows?tab=map&workflow=plan-execute')
  await expect(page.locator('.react-flow__node')).toHaveCount(4)
  await page.screenshot({
    path: testInfo.outputPath('workflow-map-desktop.png'),
    fullPage: true,
  })
  await page.getByLabel('3. Validate. 3 requirements.', { exact: true }).click()
  await expect
    .poll(() =>
      page.locator('.workflow-canvas').evaluate((canvas) => {
        const bounds = canvas.getBoundingClientRect()
        return [...canvas.querySelectorAll('.react-flow__node')].every(
          (node) => {
            const box = node.getBoundingClientRect()
            return (
              box.left >= bounds.left &&
              box.right <= bounds.right &&
              box.top >= bounds.top &&
              box.bottom <= bounds.bottom
            )
          },
        )
      }),
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('workflow-map-inspector.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click()
  await page.screenshot({
    path: testInfo.outputPath('workflow-map-editor.png'),
    fullPage: true,
  })
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      for (const fontSize of ['100%', '200%']) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = value
        }, fontSize)
        await page
          .getByRole('button', { name: 'Ordered steps', exact: true })
          .click()
        await expect(
          page.getByRole('textbox', { name: 'Node title', exact: true }),
        ).toBeVisible()
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        )
        expect(overflow, `${theme}, ${width}px, ${fontSize}`).toBe(false)
        const main = await page.locator('.workflow-map-main').boundingBox()
        const inspector = await page
          .locator('.workflow-inspector')
          .boundingBox()
        expect(inspector!.y).toBeGreaterThan(main!.y + main!.height)
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '100%'
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: testInfo.outputPath('workflow-map-mobile.png'),
  })
})
