import { expect, test } from '@playwright/test'

test('rated study state reopens offline and stays isolated between profiles', async ({ page, context }) => {
  await page.goto('/learn-japanese-app/')
  if (await page.getByRole('heading', { name: 'Choose a profile' }).count()) await page.getByRole('button', { name: /Kevin/ }).click()
  const card = page.locator('.kana-review')
  await expect(card).toBeVisible()
  const firstCardId = await card.getAttribute('data-card-id')
  await card.getByRole('button', { name: 'Show answer' }).click()
  await card.getByRole('button', { name: 'Again', exact: true }).click()
  await expect.poll(() => page.evaluate(() => new Promise<number>((resolve) => {
    const request = indexedDB.open('learn-japanese-local')
    request.onsuccess = () => { const db = request.result; const tx = db.transaction('reviewEvents'); const rows = tx.objectStore('reviewEvents').getAll(); tx.oncomplete = () => { resolve(rows.result.filter((row: { profileId: string }) => row.profileId === 'kevin').length); db.close() } }
  }))).toBe(1)
  const kevinState = await page.evaluate(() => new Promise<any>((resolve) => {
    const request = indexedDB.open('learn-japanese-local')
    request.onsuccess = () => { const db = request.result; const tx = db.transaction(['reviewEvents', 'conceptStates', 'reviewStates', 'lessonProgress']); const result: any = {}; for (const storeName of ['reviewEvents', 'conceptStates', 'reviewStates', 'lessonProgress']) { const rows = tx.objectStore(storeName).getAll(); rows.onsuccess = () => { result[storeName] = rows.result.filter((row: { profileId: string }) => row.profileId === 'kevin') } }; tx.oncomplete = () => { resolve(result); db.close() } }
  }))
  expect(kevinState.reviewEvents[0]).toMatchObject({ cardId: firstCardId, rating: 'again' })
  expect(kevinState.conceptStates.length).toBeGreaterThan(0)
  expect(kevinState.reviewStates.length).toBeGreaterThan(0)
  await page.reload()
  await expect(page.locator('.kana-review')).toBeVisible()
  expect(await page.locator('.kana-review').getAttribute('data-card-id')).not.toBe(firstCardId)
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.kana-review')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Switch profile from Kevin' }).click()
  await page.getByRole('button', { name: /Janne Faerie blossom garden/ }).click()
  await expect(page.locator('.kana-review')).toBeVisible()
  const janneEvents = await page.evaluate(() => new Promise<number>((resolve) => {
    const request = indexedDB.open('learn-japanese-local')
    request.onsuccess = () => { const db = request.result; const rows = db.transaction('reviewEvents').objectStore('reviewEvents').getAll(); rows.onsuccess = () => { resolve(rows.result.filter((row: { profileId: string }) => row.profileId === 'janne').length); db.close() } }
  }))
  expect(janneEvents).toBe(0)
})
