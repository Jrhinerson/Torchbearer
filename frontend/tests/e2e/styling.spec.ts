import { operationsFixture } from './fixtures/operations'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const sampleTask = {
  id: '62954ac2-0195-4b7f-8f57-1dd59a343d21',
  title: 'Make the next decision explicit',
  description:
    'Clarify the goal, context, and approval criteria before implementation.',
  status: 'backlog',
  routing_mode: 'frontier',
  frontier_agent: 'codex',
  next_stage: null,
  stage_agents: {
    plan: 'codex',
    integrate: 'codex',
    code_review: 'codex',
  },
  repository: null,
  revision: 0,
  completed_at: null,
  latest_run: null,
  workspace_path: '',
  branch: '',
  base_commit: '',
  created_at: '2026-11-21T12:00:00Z',
  updated_at: '2026-11-21T12:00:00Z',
}

async function seedBoard(page: Page) {
  await page.route('**/api/v1/operations/?**', (route) =>
    route.fulfill({ json: operationsFixture([sampleTask]) }),
  )
  await page.goto('/')
  await expect(
    page.getByRole('article', { name: sampleTask.title }),
  ).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function openComposer(page: Page) {
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New task', exact: true })
  await expect(dialog.getByLabel('Title', { exact: false })).toBeFocused()
  return dialog
}

function luminance(color: string) {
  const channels = color.startsWith('#')
    ? [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
    : color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
  const linear = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
}

function contrast(foreground: string, background: string) {
  const [low, high] = [luminance(foreground), luminance(background)].sort(
    (a, b) => a - b,
  )
  return (high! + 0.05) / (low! + 0.05)
}

async function expectReadable(locator: Locator) {
  const colors = await locator.evaluate((element) => {
    let surface: Element | null = element
    let background = 'rgba(0, 0, 0, 0)'
    while (surface) {
      background = getComputedStyle(surface).backgroundColor
      if (background !== 'rgba(0, 0, 0, 0)') break
      surface = surface.parentElement
    }
    return { foreground: getComputedStyle(element).color, background }
  })
  expect(
    contrast(colors.foreground, colors.background),
    JSON.stringify(colors),
  ).toBeGreaterThanOrEqual(4.5)
}

async function expectFits(page: Page, dialog: Locator) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const bounds = (await dialog.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  )
}

test('renders the dark palette before JavaScript runs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
    await expect(page.locator('html')).toHaveCSS(
      'background-color',
      'rgb(27, 40, 33)',
    )
  } finally {
    await context.close()
  }
})

test('uses actual locally served Inter fonts, including extended and italic faces', async ({
  page,
}) => {
  const fontURLs: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fontURLs.push(request.url())
  })
  await seedBoard(page)
  const faces = await page.evaluate(async () => {
    const loaded = await Promise.all([
      document.fonts.load('400 14px "Inter Variable"', 'Torchbearer'),
      document.fonts.load('500 14px "Inter Variable"', 'Torchbearer'),
      document.fonts.load('600 14px "Inter Variable"', 'Torchbearer'),
      document.fonts.load('400 14px "Inter Variable"', 'Łódź'),
      document.fonts.load(
        'italic 400 14px "Inter Variable"',
        'Torchbearer Łódź',
      ),
    ])
    return loaded.map((group) =>
      group.map((face) => ({ status: face.status, family: face.family })),
    )
  })
  for (const group of faces) {
    expect(group.length).toBeGreaterThan(0)
    expect(group.every((face) => face.status === 'loaded')).toBe(true)
  }
  const session = await page.context().newCDPSession(page)
  await session.send('DOM.enable')
  await session.send('CSS.enable')
  const { root } = await session.send('DOM.getDocument')
  const { nodeId } = await session.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '.brand',
  })
  const { fonts } = await session.send('CSS.getPlatformFontsForNode', {
    nodeId,
  })
  expect(
    fonts.some(
      (font) => font.isCustomFont && font.familyName.startsWith('Inter'),
    ),
    JSON.stringify(fonts),
  ).toBe(true)
  expect(fontURLs.length).toBeGreaterThanOrEqual(4)
  expect(
    fontURLs.every((url) => new URL(url).origin === new URL(page.url()).origin),
  ).toBe(true)
})

test('keeps the workspace usable when font delivery fails', async ({
  page,
}) => {
  await page.route('**/*.woff2', (route) => route.abort())
  await seedBoard(page)
  expect(
    await page.evaluate(() =>
      [...document.fonts].some((face) => face.status === 'loaded'),
    ),
  ).toBe(false)
  const dialog = await openComposer(page)
  await expectFits(page, dialog)
  await dialog
    .getByLabel('Title', { exact: false })
    .fill('Fallback remains usable')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'New Task', exact: true }),
  ).toBeFocused()
})

for (const theme of ['dark', 'light'] as const) {
  test(`${theme} theme keeps controls, feedback, and browser chrome readable`, async ({
    page,
  }, testInfo) => {
    await seedBoard(page)
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)
    await page
      .getByRole('article', { name: sampleTask.title })
      .getByRole('button', { name: `Expand ${sampleTask.title}`, exact: true })
      .click()
    await expect(page.locator('html')).toHaveCSS('color-scheme', theme)
    const canvas = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-canvas')
        .trim(),
    )
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      canvas,
    )
    for (const selector of [
      '.brand',
      '.column-heading h2',
      '.task-count',
      '.task-card h3',
      '.task-description',
      '.task-footer > span',
      '.column-empty-state',
      '.app-footer',
    ]) {
      await expectReadable(page.locator(selector).first())
    }

    const roles = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return Object.fromEntries(
        [...style]
          .filter((name) => name.startsWith('--color-'))
          .map((name) => [name.slice(8), style.getPropertyValue(name).trim()]),
      )
    })
    const pairs: [string, string, number][] = []
    for (const background of [
      'canvas',
      'surface',
      'surface-raised',
      'surface-overlay',
      'input',
      'surface-hover',
      'surface-active',
    ]) {
      pairs.push(['text', background, 4.5], ['text-muted', background, 4.5])
    }
    for (const state of ['primary', 'primary-hover', 'primary-active'])
      pairs.push(['primary-text', state, 4.5])
    for (const status of ['success', 'warning', 'error', 'info'])
      pairs.push([status, `${status}-surface`, 4.5])
    for (const background of [
      'surface-raised',
      'surface-overlay',
      'error-hover',
      'error-active',
    ])
      pairs.push(['error', background, 4.5])
    for (const foreground of ['focus', 'input-border']) {
      for (const background of [
        'canvas',
        'surface',
        'surface-raised',
        'surface-overlay',
        'input',
      ])
        pairs.push([foreground, background, 3])
    }
    for (const [foreground, background, minimum] of pairs) {
      expect(
        contrast(roles[foreground]!, roles[background]!),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(minimum)
    }
    await page.screenshot({
      path: testInfo.outputPath(`board-${theme}.png`),
      fullPage: true,
    })

    const dialog = await openComposer(page)
    const title = dialog.getByLabel('Title', { exact: false })
    await title.fill('Preserve context on a failed save')
    await expect(title).toHaveCSS('outline-style', 'solid')
    await expect(title).toHaveCSS('outline-width', '2px')
    for (const selector of [
      'h2',
      '.eyebrow',
      '.composer-description',
      '.field-label',
      '.optional',
      '.field',
      '.composer-footnote',
    ]) {
      await expectReadable(dialog.locator(selector).first())
    }
    const save = dialog.getByRole('button', { name: 'Add to backlog' })
    await expectReadable(save)
    await save.hover()
    await expectReadable(save)
    await page.screenshot({
      path: testInfo.outputPath(`dialog-${theme}.png`),
      fullPage: true,
    })
    await page.route('**/api/v1/tasks/', (route) =>
      route.fulfill({
        status: 400,
        json: { title: ['Add a little more context before saving.'] },
      }),
    )
    await save.click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(save).toBeEnabled()
    await expectReadable(save)
    await expectReadable(dialog.getByRole('alert'))
    await page.screenshot({
      path: testInfo.outputPath(`error-${theme}.png`),
      fullPage: true,
    })
    await page.keyboard.press('Escape')
    const trigger = page.getByRole('button', { name: 'New Task', exact: true })
    await expect(trigger).toBeFocused()
    await page.getByRole('region', { name: 'Operations columns' }).focus()
    await expect(
      page.getByRole('region', { name: 'Operations columns' }),
    ).toHaveCSS('outline-style', 'solid')
  })
}

test('keeps a 320px dialog, long content, and error actions reachable', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await seedBoard(page)
  const dialog = await openComposer(page)
  const title = dialog.getByLabel('Title', { exact: false })
  await title.fill('A'.repeat(200))
  await expect(title).toHaveCSS('font-size', '16px')
  await expectFits(page, dialog)
  await page.route('**/api/v1/tasks/', (route) =>
    route.fulfill({
      status: 400,
      json: {
        title: [
          'This task needs a clearer goal. Keep the draft and try again when you have more context.',
        ],
      },
    }),
  )
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expectFits(page, dialog)
  for (const button of await dialog.getByRole('button').all()) {
    await button.scrollIntoViewIfNeeded()
    const bounds = (await button.boundingBox())!
    expect(bounds.width).toBeGreaterThanOrEqual(44)
    expect(bounds.height).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({
    path: testInfo.outputPath('dialog-320px.png'),
    fullPage: true,
  })
})

test('supports 200% text sizing and desktop zoom-equivalent reflow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await seedBoard(page)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  const dialog = await openComposer(page)
  await expect(dialog.getByLabel('Title', { exact: false })).toHaveCSS(
    'font-size',
    '28px',
  )
  await expectFits(page, dialog)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  // At 200% desktop browser zoom, a 1280x900 window exposes about 640x450 CSS pixels.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  await page.setViewportSize({ width: 640, height: 450 })
  await openComposer(page)
  await expectFits(page, dialog)
  await dialog
    .getByRole('button', { name: 'Add to backlog' })
    .scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('dialog-zoom-reflow.png'),
    fullPage: true,
  })
})

test('shows readable pending controls and keeps a saving dialog open', async ({
  page,
}) => {
  await seedBoard(page)
  let releaseSave!: () => void
  const held = new Promise<void>((resolve) => {
    releaseSave = resolve
  })
  await page.route('**/api/v1/tasks/', async (route) => {
    await held
    await route.fulfill({
      status: 201,
      json: {
        ...sampleTask,
        id: 'ecb4aac9-e6fa-41e2-b803-089899a13bf4',
        title: 'Finish the decision',
      },
    })
  })
  const dialog = await openComposer(page)
  await dialog.getByLabel('Title', { exact: false }).fill('Finish the decision')
  await dialog.getByRole('button', { name: 'Add to backlog' }).click()
  try {
    const pending = dialog.getByRole('button', { name: 'Adding task' })
    await expect(pending).toBeDisabled()
    await expect(pending).toHaveAttribute('aria-busy', 'true')
    await expect(pending).toHaveCSS('cursor', 'progress')
    await expectReadable(pending)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
  } finally {
    releaseSave()
  }
  await expect(dialog).not.toBeVisible()
})

test('removes feedback transitions when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seedBoard(page)
  const trigger = page.getByRole('button', { name: 'New Task', exact: true })
  await expect(trigger).toHaveCSS('transition-duration', '0s')
})
