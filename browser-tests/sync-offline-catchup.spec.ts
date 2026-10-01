import { expect, test, type Browser, type BrowserContext } from '@playwright/test'

const profileIds = {
  kevin: 'f32a6c14-8d1b-4b70-9a2e-61c5d9037f48',
  janne: 'a91e5d27-3c84-46f0-bb12-72d8e4065a39',
} as const

type Save = { profile_id: string; revision: number; schema_version: number; updated_at: string; state: Record<string, unknown> }

async function mockCloud(context: BrowserContext, saves: Map<string, Save>, reads: string[]) {
  await context.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const profileId = url.searchParams.get('profile_id')?.replace(/^eq\./, '') ?? ''
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname.endsWith('/profile_saves')) {
      reads.push(profileId)
      return route.fulfill({ status: 200, headers, body: JSON.stringify(saves.get(profileId) ?? null) })
    }
    if (url.pathname.endsWith('/rpc/write_profile_save')) {
      const body = request.postDataJSON() as { p_profile_id: string; p_expected_revision: number; p_schema_version: number; p_updated_at: string; p_state: Record<string, unknown> }
      const previous = saves.get(body.p_profile_id)
      if ((previous?.revision ?? 0) !== body.p_expected_revision) return route.fulfill({ status: 200, headers, body: '[]' })
      const saved: Save = { profile_id: body.p_profile_id, revision: (previous?.revision ?? 0) + 1, schema_version: body.p_schema_version, updated_at: body.p_updated_at, state: body.p_state }
      saves.set(body.p_profile_id, saved)
      return route.fulfill({ status: 200, headers, body: JSON.stringify([saved]) })
    }
    if (url.pathname.endsWith('/profile_review_events')) return route.fulfill({ status: 200, headers, body: '[]' })
    return route.fulfill({ status: 404, headers, body: JSON.stringify({ message: `Unexpected mock request: ${url.pathname}` }) })
  })
}

async function openKevin(browser: Browser, saves: Map<string, Save>, reads: string[]) {
  const context = await browser.newContext()
  await mockCloud(context, saves, reads)
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('learn-japanese.last-profile', 'kevin'))
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  return { context, page }
}

test('offline study uploads through the configured Supabase adapter and catches up a second device store', async ({ browser, page, context }) => {
  const saves = new Map<string, Save>()
  const reads: string[] = []
  await mockCloud(context, saves, reads)
  await page.addInitScript(() => localStorage.setItem('learn-japanese.last-profile', 'kevin'))
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Welcome to Japanese' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(/Japanese uses three writing systems/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()

  await context.setOffline(false)
  await page.getByRole('button', { name: 'More' }).click()
  await expect.poll(() => saves.get(profileIds.kevin)?.revision).toBe(1)
  expect(saves.get(profileIds.kevin)?.state.lessonProgress).toEqual(expect.arrayContaining([
    expect.objectContaining({ lessonId: 'introduction', status: 'in-progress' }),
  ]))

  const second = await openKevin(browser, saves, reads)
  await second.page.getByRole('button', { name: 'More' }).click()
  await expect(second.page.getByText('Conflict')).toBeVisible()
  await second.page.getByRole('button', { name: 'Merge saves' }).click()
  await expect(second.page.getByText('Saved')).toBeVisible()
  const readProgress = async () => second.page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('learn-japanese-local')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return await new Promise<{ ids: string[]; profiles: string[] }>((resolve, reject) => {
      const request = db.transaction('lessonProgress').objectStore('lessonProgress').getAll()
      request.onsuccess = () => resolve({ ids: request.result.map((item: { id: string }) => item.id), profiles: request.result.map((item: { profileId: string }) => item.profileId) })
      request.onerror = () => reject(request.error)
    })
  })
  await expect.poll(async () => (await readProgress()).ids).toContain('kevin::introduction')
  const caughtUp = await readProgress()
  expect(caughtUp.ids).toContain('kevin::introduction')
  expect(caughtUp.profiles).toEqual(['kevin'])
  expect(reads).toContain(profileIds.kevin)
  await second.context.close()

  const janne = await browser.newContext()
  await mockCloud(janne, saves, reads)
  const jannePage = await janne.newPage()
  await jannePage.addInitScript(() => localStorage.setItem('learn-japanese.last-profile', 'janne'))
  await jannePage.goto('/')
  await expect(jannePage.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await jannePage.getByRole('button', { name: 'More' }).click()
  await expect.poll(() => reads.includes(profileIds.janne)).toBe(true)
  expect(reads).toContain(profileIds.janne)
  expect(saves.get(profileIds.janne)).toBeUndefined()
  await janne.close()
})
