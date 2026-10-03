import { expect, test } from '@playwright/test'

test('study actions leave cloud-compatible profile state serializable', async ({ page }) => {
  await page.goto('/learn-japanese-app/')
  if (await page.getByRole('heading', { name: 'Choose a profile' }).count()) await page.getByRole('button', { name: /Kevin/ }).click()
  await expect(page.getByRole('region', { name: 'Daily study card' })).toBeVisible()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: 'Good', exact: true }).click()
  const snapshot = await page.evaluate(() => new Promise<Record<string, any>>((resolve, reject) => {
    const request = indexedDB.open('learn-japanese-local')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const names = ['settings', 'lessonProgress', 'conceptStates', 'reviewEvents', 'reviewStates', 'pendingSync']
      const tx = db.transaction(names, 'readonly')
      const output: Record<string, any[]> = {}
      for (const name of names) {
        const rows = tx.objectStore(name).getAll()
        rows.onsuccess = () => { output[name] = rows.result.filter((row: { profileId: string }) => row.profileId === 'kevin') }
      }
      tx.oncomplete = () => { db.close(); resolve(JSON.parse(JSON.stringify(output))) }
      tx.onerror = () => reject(tx.error)
    }
  }))
  expect(snapshot.conceptStates).toEqual(expect.arrayContaining([expect.objectContaining({ lifecycle: 'INTRODUCED' })]))
  expect(snapshot.lessonProgress).toEqual(expect.arrayContaining([expect.objectContaining({ lessonId: 'hiragana-a-row', status: 'completed' })]))
  expect(snapshot.reviewEvents).toEqual(expect.arrayContaining([expect.objectContaining({ rating: 'good', kind: 'scheduled-review' })]))
  expect(snapshot.reviewStates).toEqual(expect.arrayContaining([expect.objectContaining({ state: expect.objectContaining({ reviewCount: 1 }) })]))
  expect(snapshot.pendingSync).toEqual(expect.arrayContaining([expect.objectContaining({ operation: 'review-event' })]))
})
