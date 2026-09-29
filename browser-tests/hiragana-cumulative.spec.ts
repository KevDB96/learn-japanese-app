import { expect, test, type Page } from '@playwright/test'

async function completeCurrentLesson(page: Page, interactWithFirstExercise = false) {
  let interacted = false
  for (let step = 0; step < 24; step += 1) {
    const complete = page.locator('.lesson-session > button').filter({ hasText: 'Complete lesson' })
    if (await complete.count()) { await complete.click(); await expect(page.getByRole('status')).toContainText('Lesson complete'); break }
    const exercise = page.locator('.lesson-session [data-exercise-id]').first()
    if (interactWithFirstExercise && !interacted && await exercise.count()) {
      const choices = exercise.getByRole('group').getByRole('button')
      await choices.nth(1).click()
      await expect(exercise.getByRole('status')).toBeVisible()
      await exercise.getByRole('button', { name: 'Try again' }).click()
      await choices.nth(0).click()
      await expect(exercise.getByRole('status')).toContainText('Correct.')
      await exercise.getByRole('button', { name: 'Continue' }).click()
      interacted = true
    }
    await page.locator('.lesson-session > button').click()
    await expect(page.locator('.lesson-session > button')).toBeEnabled()
  }
  await expect(page.getByRole('status')).toContainText('Lesson complete')
}

async function drainDueReviews(page: Page, startRatingIndex = 2) {
  let index = startRatingIndex
  const seenCards = new Set<string>()
  await expect(page.locator('.kana-review, .learn-continue')).toBeVisible()
  for (let step = 0; step < 180 && await page.locator('.kana-review').count(); step += 1) {
    const review = page.locator('.kana-review')
    const cardId = await review.getAttribute('data-card-id')
    expect(cardId).not.toBeNull()
    expect(seenCards.has(cardId!)).toBe(false)
    seenCards.add(cardId!)
    const choices = review.getByRole('group', { name: 'Review answers' }).getByRole('button')
    await choices.first().click()
    await expect(review.getByRole('status')).toBeVisible()
    const rating = index === 0 ? 'Forgot' : index === 1 ? 'Got It' : 'Got It'
    await review.getByRole('button', { name: rating, exact: true }).click()
    await expect(page.locator(`.kana-review[data-card-id="${cardId}"]`)).toHaveCount(0)
    index += 1
  }
  expect(await page.locator('.kana-review').count()).toBe(0)
}

async function readReviewData(page: Page) {
  return page.evaluate(() => new Promise<{ states: any[]; events: any[] }>((resolve, reject) => {
    const request = indexedDB.open('learn-japanese-local')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['reviewStates', 'reviewEvents'], 'readonly')
      const states = tx.objectStore('reviewStates').getAll()
      const events = tx.objectStore('reviewEvents').getAll()
      tx.oncomplete = () => { resolve({ states: states.result, events: events.result }); db.close() }
      tx.onerror = () => reject(tx.error)
    }
  }))
}

async function seedNuMeConfusion(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('learn-japanese-local')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('reviewEvents', 'readwrite')
      for (const id of ['fixture-confusion-1', 'fixture-confusion-2']) tx.objectStore('reviewEvents').put({
        id, recordVersion: 1, updatedAt: '2026-09-29T00:00:00.000Z', reviewedAt: '2026-09-29T00:00:00.000Z',
        conceptId: 'kana-hira-nu', confusedConceptId: 'kana-hira-me', cardId: 'kana-hira-nu--kana-glyph-to-sound', rating: 'again', kind: 'practice',
      })
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
  }))
}

test('cumulative Hiragana learning, review, progress, remediation, and offline flow', async ({ page, context }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Learn Japanese' })).toBeVisible()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByText('Guest mode')).toBeVisible()
  await page.getByRole('button', { name: 'Learn', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to Japanese' })).toBeVisible()
  await completeCurrentLesson(page)

  await page.reload()
  await expect(page.getByText('Hiragana A row')).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hiragana: A row' })).toBeVisible()
  await page.locator('.lesson-session > button').click()
  await expect(page.getByText(/These five vowels/)).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(/These five vowels/)).toBeVisible()
  await completeCurrentLesson(page, true)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Hiragana review' })).toBeVisible()
  await expect(page.getByText(/Next: Hiragana/)).toBeVisible()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  const vowelState = page.locator('.progress-kana-grid button').filter({ hasText: /^あ/ })
  await expect(vowelState).toContainText('Introduced')
  await expect(vowelState).not.toContainText('Mastered')
  await page.getByRole('button', { name: 'Learn', exact: true }).click()
  await expect(page.locator('.kana-review')).toBeVisible()

  const firstReview = page.locator('.kana-review')
  const firstCardId = await firstReview.getAttribute('data-card-id')
  await firstReview.getByRole('group', { name: 'Review answers' }).getByRole('button').nth(1).click()
  await expect(firstReview.getByRole('status')).toContainText('Answer:')
  await firstReview.getByRole('button', { name: 'Forgot', exact: true }).click()
  await expect.poll(() => readReviewData(page).then((data) => data.events.filter((event) => event.kind === 'scheduled-review').length)).toBe(1)
  const secondReview = page.locator('.kana-review')
  const secondCardId = await secondReview.getAttribute('data-card-id')
  await secondReview.getByRole('group', { name: 'Review answers' }).getByRole('button').first().click()
  await expect(secondReview.getByRole('status')).toContainText('Correct.')
  await secondReview.getByRole('button', { name: 'Got It', exact: true }).click()
  await expect.poll(() => readReviewData(page).then((data) => data.events.filter((event) => event.kind === 'scheduled-review').length)).toBe(2)
  expect(secondCardId).not.toBe(firstCardId)
  const nextPrompt = await page.locator('.kana-review h2').innerText()
  await page.reload()
  await expect(page.locator('.kana-review h2')).toHaveText(nextPrompt)
  const reviewData = await readReviewData(page)
  expect(reviewData.states).toHaveLength(10)
  expect(reviewData.events.filter((event) => event.kind === 'scheduled-review').map((event) => ({ rating: event.rating, cardId: event.cardId }))).toEqual(expect.arrayContaining([expect.objectContaining({ rating: 'again' }), expect.objectContaining({ rating: 'good' })]))
  expect(reviewData.states.filter((state) => state.state.reviewCount === 1)).toHaveLength(2)

  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  const vowelStateAfterReviews = page.locator('.progress-kana-grid button').filter({ hasText: /^あ/ })
  await expect(vowelStateAfterReviews).toContainText('Learning')
  await expect(vowelStateAfterReviews).not.toContainText('Mastered')
  await page.getByRole('button', { name: 'Learn', exact: true }).click()
  await drainDueReviews(page)
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()

  for (const { display, title, teach } of [
    { display: 'Hiragana K row', title: 'Hiragana: K row', teach: 'Add k before each vowel sound' },
    { display: 'Hiragana S row', title: 'Hiragana: S row', teach: 'Most sounds add s before the vowel' },
    { display: 'Hiragana T row', title: 'Hiragana: T row', teach: 'Most sounds add t before the vowel' },
  ]) {
    await expect(page.getByText(display)).toBeVisible()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.locator('.lesson-session')).toBeVisible()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await page.locator('.lesson-session > button').click()
    await expect(page.getByText(new RegExp(teach))).toBeVisible()
    await completeCurrentLesson(page, true)
    await page.reload()
    await drainDueReviews(page)
  }

  await seedNuMeConfusion(page)
  await page.reload()
  await drainDueReviews(page)
  await expect(page.getByRole('region', { name: 'Hiragana contrast practice' })).toBeVisible()
  await page.getByRole('button', { name: 'Practice contrast' }).click()
  const contrast = page.getByRole('region', { name: 'Hiragana contrast practice' })
  await expect(contrast.getByRole('heading')).toContainText('ぬ')
  await contrast.getByRole('group', { name: 'Kana choices' }).getByRole('button', { name: 'め' }).click()
  await expect(contrast.getByRole('status')).toHaveText('Try again')
  await contrast.getByRole('group', { name: 'Kana choices' }).getByRole('button', { name: 'ぬ' }).click()
  await contrast.getByRole('group', { name: 'Kana choices' }).getByRole('button', { name: 'め' }).click()
  await expect(contrast.getByRole('status')).toHaveText('Contrast complete')
  await contrast.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.locator('.progress-kana-grid li')).toHaveCount(46)
  await expect(page.locator('.progress-kana-grid button').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1024, height: 768 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const beforeOffline = await readReviewData(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.progress-kana-grid li')).toHaveCount(46)
  await expect(await readReviewData(page)).toEqual(beforeOffline)
  await page.getByRole('button', { name: 'Learn', exact: true }).click()
  await expect(page.locator('.learn-continue, .kana-review')).toBeVisible()

  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  const navBox = await nav.boundingBox()
  expect(navBox).not.toBeNull()
  expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
