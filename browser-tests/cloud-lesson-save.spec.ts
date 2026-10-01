import { expect, test } from '@playwright/test'

const profileId = 'f32a6c14-8d1b-4b70-9a2e-61c5d9037f48'

test('cloud acknowledgement includes completed lesson progress after Saved', async ({ page, context }) => {
  const saves = new Map<string, { revision: number; state: Record<string, unknown> }>()
  const writes: Record<string, unknown>[] = []
  await page.route('http://127.0.0.1:4173/learn-japanese-app/**', (route) => {
    const url = new URL(route.request().url())
    url.pathname = url.pathname.replace('/learn-japanese-app', '')
    return route.continue({ url: url.toString() })
  })
  await context.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname.endsWith('/profile_saves')) return route.fulfill({ status: 200, headers, body: JSON.stringify(saves.get(profileId) ?? null) })
    if (url.pathname.endsWith('/rpc/write_profile_save')) {
      const body = request.postDataJSON() as { p_profile_id: string; p_expected_revision: number; p_schema_version: number; p_updated_at: string; p_state: Record<string, unknown> }
      writes.push(body.p_state)
      const previous = saves.get(body.p_profile_id)
      if ((previous?.revision ?? 0) !== body.p_expected_revision) return route.fulfill({ status: 200, headers, body: '[]' })
      const saved = { revision: (previous?.revision ?? 0) + 1, state: body.p_state }
      saves.set(body.p_profile_id, saved)
      return route.fulfill({ status: 200, headers, body: JSON.stringify([{ profile_id: body.p_profile_id, revision: saved.revision, schema_version: body.p_schema_version, updated_at: body.p_updated_at, state: saved.state }]) })
    }
    if (url.pathname.endsWith('/profile_review_events')) return route.fulfill({ status: 200, headers, body: '[]' })
    return route.fulfill({ status: 404, headers, body: JSON.stringify({ message: `Unexpected mock request: ${url.pathname}` }) })
  })
  await page.route('http://127.0.0.1:4173/__lesson_save_seed__', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><script>
      const request = indexedDB.open('learn-japanese-local', 1);
      request.onupgradeneeded = () => { for (const name of ['profiles','settings','lessonProgress','conceptStates','reviewEvents','pendingSync','appMetadata','deviceMetadata']) request.result.createObjectStore(name, { keyPath: 'id' }); };
      request.onsuccess = () => { const db = request.result; const tx = db.transaction('lessonProgress', 'readwrite'); tx.objectStore('lessonProgress').put({ id: 'migration-fixture', lessonId: 'migration-fixture', status: 'completed', recordVersion: 1, updatedAt: '2020-01-01T00:00:00.000Z' }); tx.oncomplete = () => { db.close(); document.body.dataset.seeded = 'true'; }; };
      request.onerror = () => { document.body.textContent = 'legacy database seed failed'; };
    </script>`,
  }))
  await page.goto('/__lesson_save_seed__')
  await page.waitForFunction(() => document.body.dataset.seeded === 'true')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Choose a profile' })).toBeVisible()
  await page.getByRole('button', { name: /Kevin/ }).click()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()

  const completeLesson = async (exercise = false) => {
    let exercised = false
    for (let step = 0; step < 30; step += 1) {
      const complete = page.getByRole('button', { name: 'Complete lesson', exact: true })
      if (await complete.count()) {
        await complete.click()
        await expect(page.getByText('Lesson complete')).toBeVisible()
        return
      }
      if (exercise && !exercised) {
        const group = page.locator('.lesson-session [role="group"]').first()
        if (await group.count()) {
          await group.getByRole('button').first().click()
          const innerContinue = page.locator('.lesson-session [data-exercise-id] button').filter({ hasText: 'Continue' }).first()
          if (await innerContinue.count()) await innerContinue.click()
          exercised = true
        }
      }
      await page.locator('.lesson-session > button').click()
      await expect(page.locator('.lesson-session > button')).toBeEnabled()
    }
    throw new Error('Lesson did not reach completion')
  }

  await page.getByRole('button', { name: 'Learn', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to Japanese' })).toBeVisible()
  await completeLesson()
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hiragana: A row' })).toBeVisible()
  await completeLesson(true)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 20_000 })
  expect(writes.at(-1)?.lessonProgress).toEqual(expect.arrayContaining([
    expect.objectContaining({ lessonId: 'hiragana-a-row', status: 'completed' }),
  ]))
  expect(saves.get(profileId)?.state.lessonProgress).toEqual(expect.arrayContaining([
    expect.objectContaining({ lessonId: 'hiragana-a-row', status: 'completed' }),
  ]))
})
