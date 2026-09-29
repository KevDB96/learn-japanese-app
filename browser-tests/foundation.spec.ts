import { expect, test } from '@playwright/test'

test('guest Introduction resumes, completes, and remains available offline', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Learn Japanese' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  for (const name of ['Learn', 'Practice', 'Progress', 'More']) await expect(page.getByRole('button', { name })).toBeVisible()

  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifest).toBe('/manifest.webmanifest')
  const appManifest = await page.evaluate(async () => fetch('/manifest.webmanifest').then((response) => response.json()))
  expect(appManifest).toMatchObject({ name: 'Learn Japanese', short_name: 'Japanese', display: 'standalone', theme_color: '#f7f5ef', background_color: '#f7f5ef' })
  expect(appManifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }),
    expect.objectContaining({ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }),
  ]))
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByText('Guest mode')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue as Guest' })).toBeVisible()
  await page.getByRole('button', { name: 'Learn' }).click()

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to Japanese' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('learn-japanese-local')
    request.onsuccess = () => { const db = request.result; const get = db.transaction('lessonProgress').objectStore('lessonProgress').get('introduction'); get.onsuccess = () => { resolve(get.result?.currentBlockId); db.close() } }
    request.onerror = () => resolve('error')
  }))).toBe('writing-systems')
  await page.reload()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(/Japanese uses three writing systems/)).toBeVisible()

  for (let block = 1; block < 5; block += 1) await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Quick check' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Quick check' })).toBeVisible()

  await page.getByRole('button', { name: 'Hiragana' }).click()
  await expect(page.getByRole('status')).toContainText('Katakana commonly writes borrowed words')
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByRole('button', { name: 'Katakana' }).click()
  await expect(page.getByRole('status')).toContainText('Correct.')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Select the Japanese greeting.' })).toBeVisible()
  await page.locator('[data-exercise-id="hello-script-check"] [role="group"] button').nth(1).click()
  await expect(page.getByRole('status')).toContainText('Japanese greeting meaning hello')
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.locator('[data-exercise-id="hello-script-check"] [role="group"] button').first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('textbox', { name: 'Answer' }).fill('No')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('status')).toContainText('Reviews help strengthen memory')
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByRole('textbox', { name: 'Answer' }).fill('Reviews')
  await page.getByRole('button', { name: 'Check' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Complete lesson' }).click()
  await expect(page.getByRole('status')).toContainText('Lesson complete')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Learn Japanese' })).toBeVisible()
  await expect(page.getByText('Hiragana A row')).toBeVisible()
  await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('learn-japanese-local')
    request.onsuccess = () => { const db = request.result; const get = db.transaction('lessonProgress').objectStore('lessonProgress').get('introduction'); get.onsuccess = () => { resolve(get.result?.status); db.close() } }
    request.onerror = () => resolve('error')
  }))).toBe('completed')
  await expect(page.evaluate(() => caches.keys())).resolves.toContainEqual(expect.stringMatching(/^learn-japanese-/))

  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  const bounds = await nav.boundingBox()
  const viewport = page.viewportSize()!
  expect(bounds).not.toBeNull()
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('navigation fits a wider responsive viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(nav).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
