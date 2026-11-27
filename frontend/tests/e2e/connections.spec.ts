import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const authorizationId = '0c0d6650-8828-491d-b9bd-955d4fe11ec6'
const githubUrl = 'https://github.com/login/device'
const account = {
  id: 583231,
  login: 'octocat',
  name: 'The Octocat',
  connected_at: '2026-11-24T12:00:00Z',
  reauthorization_required: false,
}
const pendingAuthorization = {
  id: authorizationId,
  state: 'pending' as const,
  user_code: 'ABCD-1234',
  verification_url: githubUrl,
  expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  poll_after: 1,
  error: '',
}

interface GitHubConnection {
  available: boolean
  unavailable_reason: string
  account: typeof account | null
  authorization:
    | (Omit<typeof pendingAuthorization, 'state'> & {
        state: 'pending' | 'failed' | 'expired'
      })
    | null
}

async function mockGitHub(page: Page, initial?: Partial<GitHubConnection>) {
  let state: GitHubConnection = {
    available: true,
    unavailable_reason: '',
    account: null,
    authorization: null,
    ...initial,
  }
  let failure = ''
  let approved = false
  let startError = ''
  let verificationError = ''
  let revoked = false
  const calls: string[] = []
  await page.context().route(githubUrl, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>GitHub sign in</h1>',
    }),
  )
  await page.route('**/api/v1/connections/github/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() !== 'GET') {
      expect(request.headers()['x-csrftoken']).toBeTruthy()
      calls.push(`${request.method()} ${path}`)
    }
    if (path.endsWith('/connect/')) {
      if (startError) {
        await route.fulfill({ status: 503, json: { detail: startError } })
        return
      }
      state = {
        ...state,
        authorization: { ...pendingAuthorization, user_code: '' },
      }
    } else if (path.endsWith('/poll/')) {
      expect(request.postDataJSON()).toEqual({
        authorization_id: authorizationId,
      })
      if (approved) state = { ...state, account, authorization: null }
      else if (failure)
        state = {
          ...state,
          authorization: {
            ...pendingAuthorization,
            state: 'failed',
            error: failure,
          },
        }
      else state = { ...state, authorization: pendingAuthorization }
    } else if (path.endsWith('/verify/')) {
      if (verificationError) {
        await route.fulfill({
          status: 503,
          json: { detail: verificationError },
        })
        return
      }
      if (revoked && state.account)
        state = {
          ...state,
          account: { ...state.account, reauthorization_required: true },
        }
    } else if (path.endsWith('/cancel/')) {
      expect(request.postDataJSON()).toEqual({
        authorization_id: authorizationId,
      })
      state = { ...state, authorization: null }
    } else if (request.method() === 'DELETE') {
      state = { ...state, account: null, authorization: null }
    }
    await route.fulfill({ json: state })
  })
  return {
    calls,
    approve: () => {
      approved = true
    },
    fail: (message: string) => {
      failure = message
    },
    failStart: (message: string) => {
      startError = message
    },
    failVerification: (message: string) => {
      verificationError = message
    },
    revoke: () => {
      revoked = true
    },
  }
}

test('opens GitHub browser authorization, verifies the account, and disconnects', async ({
  page,
  context,
}, testInfo) => {
  const github = await mockGitHub(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible()
  await expect(page.getByText('Not connected', { exact: true })).toBeVisible()
  const opened = page.waitForEvent('popup')
  await page
    .getByRole('button', { name: 'Connect GitHub', exact: true })
    .click()
  const popup = await opened
  await expect(page.getByText('ABCD-1234', { exact: true })).toBeVisible()
  await expect(popup).toHaveURL(githubUrl)
  await page.screenshot({
    path: testInfo.outputPath('github-authorization.png'),
    fullPage: true,
  })
  await expect(
    popup.getByRole('heading', { name: 'GitHub sign in' }),
  ).toBeVisible()
  expect(await popup.evaluate(() => window.opener)).toBeNull()
  await page.bringToFront()
  await page.getByRole('button', { name: 'Copy code', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Copied', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'ABCD-1234',
  )
  github.approve()
  await expect(
    page.getByRole('link', { name: '@octocat', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Cancel sign-in' }),
  ).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('link', { name: '@octocat' })).toBeVisible()
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect(page.getByText('Not connected', { exact: true })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Connect GitHub', exact: true }),
  ).toBeEnabled()
  expect(github.calls.some((call) => call.startsWith('DELETE'))).toBe(true)
  await popup.close()
})

test('resumes pending sign-in on reload and can cancel without replacing the account', async ({
  page,
}) => {
  await mockGitHub(page, { account, authorization: pendingAuthorization })
  await page.goto('/settings')
  await expect(page.getByText('ABCD-1234', { exact: true })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('link', { name: 'Continue on GitHub' }),
  ).toHaveAttribute('href', githubUrl)
  await page
    .getByRole('button', { name: 'Cancel sign-in', exact: true })
    .click()
  await expect(page.getByRole('link', { name: '@octocat' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Change account' }),
  ).toBeEnabled()
  await expect(page.getByText('ABCD-1234', { exact: true })).toHaveCount(0)
})

test('shows denied authorization and retains the existing connection', async ({
  page,
}) => {
  const github = await mockGitHub(page, {
    account,
    authorization: pendingAuthorization,
  })
  github.fail('GitHub authorization was denied. Try connecting again.')
  await page.goto('/settings')
  await expect(page.getByRole('alert')).toContainText(
    'GitHub authorization was denied',
  )
  await expect(page.getByRole('link', { name: '@octocat' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Change account' }),
  ).toBeEnabled()
})

test('reports authorization startup errors and closes the temporary tab', async ({
  page,
}) => {
  const github = await mockGitHub(page)
  github.failStart('Could not reach GitHub. Please try again.')
  await page.goto('/settings')
  const opened = page.waitForEvent('popup')
  await page
    .getByRole('button', { name: 'Connect GitHub', exact: true })
    .click()
  const popup = await opened
  await expect(page.getByRole('alert')).toContainText('Could not reach GitHub')
  await expect.poll(() => popup.isClosed()).toBe(true)
  await expect(
    page.getByRole('button', { name: 'Connect GitHub', exact: true }),
  ).toBeEnabled()
})

test('offers a manual browser link when popups are blocked', async ({
  page,
}) => {
  await mockGitHub(page)
  await page.addInitScript(() => {
    window.open = () => null
  })
  await page.goto('/settings')
  await page
    .getByRole('button', { name: 'Connect GitHub', exact: true })
    .click()
  await expect(page.getByText('ABCD-1234', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Continue on GitHub' }),
  ).toHaveAttribute('href', githubUrl)
})

test('handles an unconfigured publisher app and a failed initial status request', async ({
  page,
}) => {
  await mockGitHub(page, {
    available: false,
    unavailable_reason:
      'GitHub sign-in is not configured in this build. Contact the app publisher.',
  })
  await page.goto('/settings')
  await expect(
    page.getByText(
      'GitHub sign-in is not configured in this build. Contact the app publisher.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Connect GitHub', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Reload connections' }).click()
  await page.route('**/api/v1/connections/github/', (route) =>
    route.fulfill({
      status: 503,
      json: { detail: 'Local service unavailable.' },
    }),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText(
    'Local service unavailable',
  )
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Local service unavailable',
  )
})

test('requires fresh authorization for an earlier connection and displays GitHub expiry', async ({
  page,
}) => {
  await mockGitHub(page, {
    account: { ...account, reauthorization_required: true },
  })
  await page.goto('/settings')
  await expect(
    page.getByText('Sign-in required', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Reconnect GitHub', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('link', { name: '@octocat' })).toBeVisible()
  await page.addScriptTag({ content: 'window.open = () => null' })
  await page
    .getByRole('button', { name: 'Reconnect GitHub', exact: true })
    .click()
  await expect(page.getByText('ABCD-1234', { exact: true })).toBeVisible()
  await expect(page.locator('time')).toHaveAttribute(
    'datetime',
    pendingAuthorization.expires_at,
  )
})

test('fits narrow screens and large text with keyboard accessible actions', async ({
  page,
}, testInfo) => {
  await mockGitHub(page, { authorization: pendingAuthorization })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/settings')
  await expect(page.getByText('ABCD-1234', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('connections-320px.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('connections-large-text.png'),
    fullPage: true,
  })
  const cancel = page.getByRole('button', {
    name: 'Cancel sign-in',
    exact: true,
  })
  await cancel.focus()
  await expect(cancel).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Connect GitHub', exact: true }),
  ).toBeEnabled()
})

test('recovers from an interrupted authorization after a backend restart', async ({
  page,
}) => {
  await mockGitHub(page, { authorization: pendingAuthorization })
  await page.route('**/api/v1/connections/github/poll/', (route) =>
    route.fulfill({
      status: 409,
      json: { detail: 'Sign-in is no longer active.' },
    }),
  )
  await page.goto('/settings')
  await expect(page.getByText('ABCD-1234', { exact: true })).toBeVisible()
  await page.route('**/api/v1/connections/github/', (route) =>
    route.fulfill({ json: { available: true, account, authorization: null } }),
  )
  await expect(page.getByRole('link', { name: '@octocat' })).toBeVisible()
  await expect(page.getByText('ABCD-1234', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('automatically checks saved authorization and offers reconnect when revoked', async ({
  page,
}) => {
  const github = await mockGitHub(page, { account })
  github.revoke()
  await page.goto('/settings')
  await expect(
    page.getByText('Sign-in required', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: '@octocat' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Reconnect GitHub', exact: true }),
  ).toBeEnabled()
  expect(github.calls.filter((call) => call.endsWith('/verify/'))).toHaveLength(
    1,
  )
})

test('keeps account context during a verification outage and can retry', async ({
  page,
}) => {
  const github = await mockGitHub(page, { account })
  github.failVerification(
    'GitHub is temporarily unavailable. Please try again.',
  )
  await page.goto('/settings')
  await expect(page.getByRole('alert')).toContainText(
    'GitHub is temporarily unavailable',
  )
  await expect(page.getByRole('link', { name: '@octocat' })).toBeVisible()
  github.failVerification('')
  await page
    .getByRole('button', { name: 'Check connection', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Check connection', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(github.calls.filter((call) => call.endsWith('/verify/'))).toHaveLength(
    2,
  )
})
