import { expect, test } from '@playwright/test'

async function reviewData(page: import('@playwright/test').Page) {
  return page.evaluate(() => new Promise<{ states: any[]; events: any[]; concepts: any[]; lessons: any[] }>((resolve, reject) => {
    const request = indexedDB.open('learn-japanese-local')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['reviewStates', 'reviewEvents', 'conceptStates', 'lessonProgress'], 'readonly')
      const states = tx.objectStore('reviewStates').getAll()
      const events = tx.objectStore('reviewEvents').getAll()
      const concepts = tx.objectStore('conceptStates').getAll()
      const lessons = tx.objectStore('lessonProgress').getAll()
      tx.oncomplete = () => { resolve({ states: states.result, events: events.result, concepts: concepts.result, lessons: lessons.result }); db.close() }
      tx.onerror = () => reject(tx.error)
    }
  }))
}

test('daily study selects due first, reveals and rates cards, persists through reload and works offline', async ({ page, context }) => {
  await page.goto('/learn-japanese-app/')
  if (await page.getByRole('heading', { name: 'Choose a profile' }).count()) await page.getByRole('button', { name: /Kevin/ }).click()
  await expect(page.getByRole('heading', { name: 'Learn Japanese' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Daily study card' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0)
  await expect(page.getByText('YOUR FIRST COURSE')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible()
  const card = page.locator('.kana-review')
  const cardId = await card.getAttribute('data-card-id')
  expect(cardId).toBeTruthy()
  await expect(card.getByRole('group', { name: 'Review rating' })).toHaveCount(0)
  await card.getByRole('button', { name: 'Show answer' }).click()
  await expect(card.getByRole('status')).toBeVisible()
  for (const label of ['Again', 'Hard', 'Good', 'Easy']) await expect(card.getByRole('button', { name: label, exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Good', exact: true }).click()
  await expect.poll(() => reviewData(page).then((data) => data.events.length)).toBe(1)
  const persisted = await reviewData(page)
  expect(persisted.events[0]).toMatchObject({ cardId, rating: 'good', kind: 'scheduled-review', profileId: 'kevin' })
  expect(persisted.concepts.filter((item) => item.lifecycle === 'INTRODUCED').length).toBeLessThanOrEqual(5)
  expect(persisted.lessons.some((item) => item.lessonId === 'hiragana-a-row' && item.status === 'completed')).toBe(true)
  await page.reload()
  await expect(page.locator('.kana-review')).toBeVisible()
  expect(await page.locator('.kana-review').getAttribute('data-card-id')).not.toBe(cardId)
  expect((await reviewData(page)).events).toHaveLength(1)
  await expect(page.locator('.kana-review')).toContainText('cards remaining')

  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.kana-review')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await context.setOffline(false)

  await page.getByRole('button', { name: 'Switch profile from Kevin' }).click()
  await page.getByRole('button', { name: /Janne Faerie blossom garden/ }).click()
  await expect(page.locator('.kana-review')).toBeVisible()
  const janneData = await reviewData(page)
  expect(janneData.events.filter((item) => item.profileId === 'janne')).toEqual([])
  expect(janneData.concepts.filter((item) => item.profileId === 'janne')).toHaveLength(5)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'janne')

})
