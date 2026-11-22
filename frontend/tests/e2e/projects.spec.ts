import { expect, test as base } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const test = base.extend<{ projectFolder: string }>({
  projectFolder: async ({ browserName }, provideFolder) => {
    const directory = await mkdtemp(
      path.join(tmpdir(), `torchbearer-project-${browserName}-`),
    )
    await mkdir(path.join(directory, 'child'))
    try {
      await provideFolder(directory)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
})

async function openTask(page: Page, title: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New task', exact: true })
  await dialog.getByLabel('Title', { exact: false }).fill(title)
  return dialog
}

function projectTrigger(dialog: Locator) {
  return dialog.getByRole('button', { name: /^Project optional/ })
}

async function openAdd(dialog: Locator) {
  await projectTrigger(dialog).click()
  await dialog
    .getByRole('button', { name: '+ Add Project', exact: true })
    .click()
}

async function addLocal(dialog: Locator, folder: string, name: string) {
  await openAdd(dialog)
  await dialog.getByLabel('Local folder path').fill(folder)
  await dialog.getByLabel('Project name', { exact: false }).fill(name)
  await dialog.getByRole('button', { name: 'Add and select project' }).click()
  await expect(projectTrigger(dialog)).toContainText(name)
}

test('browses and adds a project, retains the draft, and saves a reusable association', async ({
  page,
  projectFolder,
}) => {
  const title = `Project task ${Date.now()}`
  const name = `Browsable project ${Date.now()}`
  const dialog = await openTask(page, title)
  await dialog
    .getByLabel('Description', { exact: false })
    .fill('Keep this context while adding a project.')
  await openAdd(dialog)
  await dialog.getByRole('button', { name: 'Browse', exact: true }).click()
  const browser = dialog.getByRole('region', { name: 'Browse local folders' })
  await browser.getByLabel('Browse folders on this machine').fill(projectFolder)
  await browser.getByLabel('Browse folders on this machine').press('Enter')
  await browser.getByRole('button', { name: 'child', exact: false }).click()
  await expect(
    browser.getByLabel('Browse folders on this machine'),
  ).toHaveValue(path.join(projectFolder, 'child'))
  await browser
    .getByRole('button', { name: 'Parent folder', exact: false })
    .click()
  await expect(
    browser.getByLabel('Browse folders on this machine'),
  ).toHaveValue(projectFolder)
  await browser.getByRole('button', { name: 'Use this folder' }).click()
  await expect(dialog.getByLabel('Local folder path')).toHaveValue(
    projectFolder,
  )
  await dialog.getByLabel('Project name', { exact: false }).fill(name)
  await dialog.getByRole('button', { name: 'Add and select project' }).click()
  await expect(projectTrigger(dialog)).toContainText(name)
  await expect(dialog.getByLabel('Title', { exact: false })).toHaveValue(title)
  await expect(dialog.getByLabel('Description', { exact: false })).toHaveValue(
    'Keep this context while adding a project.',
  )
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  await expect(projectTrigger(dialog)).toContainText(name)
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await expect(card).toContainText(name)
  await page.reload()
  await expect(card).toContainText(name)

  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  await projectTrigger(dialog).click()
  const search = dialog.getByRole('searchbox', { name: 'Search projects' })
  await expect(search).toBeFocused()
  await search.fill(projectFolder)
  await expect(
    dialog.getByRole('button', { name: `Select ${name}`, exact: true }),
  ).toBeVisible()
  await search.fill('no-such-project-xyz')
  await expect(dialog.getByText('No projects match your search.')).toBeVisible()
  await search.fill(name.toUpperCase())
  await search.press('Enter')
  await expect(projectTrigger(dialog)).toContainText(name)
  await expect(projectTrigger(dialog)).toBeFocused()
  await expect(dialog).toBeVisible()
  await projectTrigger(dialog).click()
  await page.keyboard.press('Escape')
  await expect(
    dialog.getByRole('region', { name: 'Project picker' }),
  ).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})

test('renames and removes a saved project while preserving its task', async ({
  page,
  projectFolder,
}) => {
  const title = `Keep project history ${Date.now()}`
  const name = `Managed project ${Date.now()}`
  const renamed = `${name} renamed`
  const dialog = await openTask(page, title)
  await addLocal(dialog, projectFolder, name)
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  const card = page.getByRole('article', { name: title, exact: true })
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  await projectTrigger(dialog).click()
  await dialog
    .getByRole('button', { name: 'Manage projects', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: `Rename ${name}`, exact: true })
    .click()
  await dialog.getByLabel('New project name').fill(renamed)
  await dialog.getByRole('button', { name: 'Save name' }).click()
  await expect(projectTrigger(dialog)).toContainText(renamed)
  await expect(card).toContainText(renamed)
  page.once('dialog', (prompt) => prompt.dismiss())
  await dialog
    .getByRole('button', { name: `Remove ${renamed}`, exact: true })
    .click()
  await expect(
    dialog.getByRole('button', { name: `Rename ${renamed}`, exact: true }),
  ).toBeVisible()
  page.once('dialog', (prompt) => prompt.accept())
  await dialog
    .getByRole('button', { name: `Remove ${renamed}`, exact: true })
    .click()
  await expect(projectTrigger(dialog)).toContainText('Select a project')
  await expect(
    dialog.getByRole('button', { name: `Rename ${renamed}`, exact: true }),
  ).toHaveCount(0)
  await expect(card).toContainText('Removed project')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await expect(card).toContainText(renamed)
  await expect(card).toContainText('Removed project')
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  await projectTrigger(dialog).click()
  await expect(
    dialog.getByRole('button', { name: `Select ${renamed}`, exact: true }),
  ).toHaveCount(0)
})

test('keeps the draft when folder validation or duplicate registration fails', async ({
  page,
  projectFolder,
}) => {
  const title = `Retain project draft ${Date.now()}`
  const name = `Duplicate project ${Date.now()}`
  const dialog = await openTask(page, title)
  await addLocal(dialog, projectFolder, name)
  await openAdd(dialog)
  await dialog.getByLabel('Local folder path').fill('missing-relative-folder')
  await dialog.getByRole('button', { name: 'Add and select project' }).click()
  await expect(dialog.getByRole('alert')).toContainText('absolute')
  await expect(dialog.getByLabel('Title', { exact: false })).toHaveValue(title)
  await dialog.getByLabel('Local folder path').fill(projectFolder)
  await dialog.getByRole('button', { name: 'Add and select project' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'already a saved project',
  )
  await expect(dialog.getByLabel('Local folder path')).toHaveValue(
    projectFolder,
  )
  await expect(projectTrigger(dialog)).toContainText(name)
  await dialog.getByRole('button', { name: 'Back to projects' }).click()
  await dialog.getByRole('button', { name: 'No project', exact: false }).click()
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  await expect(
    page.getByRole('article', { name: title, exact: true }),
  ).toBeVisible()
})

test('recovers from project loading failure and still allows unassigned tasks', async ({
  page,
}) => {
  await page.route('**/api/v1/projects/', (route) => route.abort('failed'))
  const title = `Unassigned during outage ${Date.now()}`
  const dialog = await openTask(page, title)
  await expect(dialog.getByRole('alert')).toContainText(
    'Could not reach the local service',
  )
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  await expect(
    page.getByRole('article', { name: title, exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  await page.unroute('**/api/v1/projects/')
  await dialog.getByRole('button', { name: 'Retry projects' }).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await projectTrigger(dialog).click()
  await expect(dialog.getByText('Loading projects…')).toHaveCount(0)
  await expect(
    dialog.getByRole('button', { name: '+ Add Project', exact: true }),
  ).toBeEnabled()
})

test('preserves selection and allows retry after rename and removal fail', async ({
  page,
  projectFolder,
}) => {
  const name = `Retry managed project ${Date.now()}`
  const dialog = await openTask(page, `Retry management ${Date.now()}`)
  await addLocal(dialog, projectFolder, name)
  await projectTrigger(dialog).click()
  await dialog
    .getByRole('button', { name: 'Manage projects', exact: true })
    .click()
  await page.route('**/api/v1/projects/*/', (route) =>
    route.fulfill({
      status: 500,
      json: { detail: 'Project update failed. Try again.' },
    }),
  )
  await dialog
    .getByRole('button', { name: `Rename ${name}`, exact: true })
    .click()
  await dialog.getByLabel('New project name').fill(`${name} updated`)
  await dialog.getByRole('button', { name: 'Save name' }).click()
  await expect(dialog.getByRole('alert')).toHaveText(
    'Project update failed. Try again.',
  )
  await expect(dialog.getByLabel('New project name')).toHaveValue(
    `${name} updated`,
  )
  await expect(projectTrigger(dialog)).toContainText(name)
  await dialog.getByRole('button', { name: 'Cancel rename' }).click()
  page.once('dialog', (prompt) => prompt.accept())
  await dialog
    .getByRole('button', { name: `Remove ${name}`, exact: true })
    .click()
  await expect(dialog.getByRole('alert')).toHaveText(
    'Project update failed. Try again.',
  )
  await expect(
    dialog.getByRole('button', { name: `Rename ${name}`, exact: true }),
  ).toBeVisible()
  await page.unroute('**/api/v1/projects/*/')
  page.once('dialog', (prompt) => prompt.accept())
  await dialog
    .getByRole('button', { name: `Remove ${name}`, exact: true })
    .click()
  await expect(projectTrigger(dialog)).toContainText('Select a project')
})

test('shows clone failures and pending state, then selects the cloned project', async ({
  page,
  projectFolder,
}) => {
  const title = `Clone task draft ${Date.now()}`
  const dialog = await openTask(page, title)
  await openAdd(dialog)
  await dialog
    .getByRole('button', { name: 'Clone a Git URL', exact: true })
    .click()
  await dialog
    .getByLabel('Git URL', { exact: true })
    .fill('file:///invalid/repo')
  await dialog
    .getByLabel('Clone destination')
    .fill(path.join(projectFolder, 'clone'))
  await dialog.getByRole('button', { name: 'Clone and select project' }).click()
  await expect(dialog.getByRole('alert')).toContainText('HTTPS or SSH')
  await expect(dialog.getByLabel('Title', { exact: false })).toHaveValue(title)
  await dialog
    .getByLabel('Git URL', { exact: true })
    .fill('https://example.com/owner/project.git')
  let finishClone!: () => void
  const cloneFinished = new Promise<void>((resolve) => {
    finishClone = resolve
  })
  const project = {
    id: 'b90a5c3e-0059-4c43-b953-9f4327212ca8',
    name: 'Cloned project',
    path: path.join(projectFolder, 'clone'),
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  await page.route('**/api/v1/projects/', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    expect(route.request().postDataJSON()).toMatchObject({
      source: 'clone',
      url: 'https://example.com/owner/project.git',
      path: project.path,
    })
    await cloneFinished
    await route.fulfill({ status: 201, json: project })
  })
  await dialog.getByRole('button', { name: 'Clone and select project' }).click()
  await expect(
    dialog.getByRole('button', { name: 'Cloning repository…' }),
  ).toBeDisabled()
  await expect(
    dialog.getByRole('button', { name: 'Add to backlog' }),
  ).toBeDisabled()
  await expect(
    dialog.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  finishClone()
  await expect(projectTrigger(dialog)).toContainText('Cloned project')
  await expect(dialog.getByLabel('Title', { exact: false })).toHaveValue(title)
  await expect(
    dialog.getByRole('button', { name: 'Add to backlog' }),
  ).toBeEnabled()
})

test('keeps the folder and clone flows within a narrow viewport', async ({
  page,
  projectFolder,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const dialog = await openTask(page, 'Choose a mobile project')
  await openAdd(dialog)
  await dialog
    .getByRole('button', { name: 'Clone a Git URL', exact: true })
    .click()
  await dialog
    .getByLabel('Git URL', { exact: true })
    .fill('https://github.com/example/project.git')
  await dialog.getByRole('button', { name: 'Browse parent' }).click()
  const browser = dialog.getByRole('region', { name: 'Browse local folders' })
  await browser.getByLabel('Browse folders on this machine').fill(projectFolder)
  await browser.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(
    browser.getByLabel('Browse folders on this machine'),
  ).toHaveValue(projectFolder)
  await browser.getByRole('button', { name: 'Use this folder' }).click()
  await expect(dialog.getByLabel('Clone destination')).toHaveValue(
    path.join(projectFolder, 'project'),
  )
  const bounds = await dialog.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('project-picker-mobile.png'),
    fullPage: true,
  })
})
