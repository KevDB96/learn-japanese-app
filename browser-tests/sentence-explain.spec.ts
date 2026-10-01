import { expect, test, type Page } from '@playwright/test'

async function completeCurrentLesson(page: Page) {
  for (let step = 0; step < 32; step += 1) {
    const action = page.locator('.lesson-session > button')
    const label = await action.innerText()
    if (label.includes('Complete lesson') || label.includes('Return')) {
      await action.click()
      if (label.includes('Complete lesson')) await expect(page.getByRole('status')).toContainText('Lesson complete')
      return
    }
    await action.click()
    await expect(page.locator('.lesson-session > button')).toBeEnabled()
  }
  throw new Error('Lesson did not reach its final action')
}

test('sentence explanations link back to their teaching lesson in both profiles', async ({ browser }) => {
  test.setTimeout(120_000)
  for (const profile of ['kevin', 'janne'] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await page.addInitScript((id) => localStorage.setItem('learn-japanese.last-profile', id), profile)
    await page.goto('/')
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', profile)

    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Welcome to Japanese' })).toBeVisible()
    await completeCurrentLesson(page)
    await page.reload()
    await expect(page.getByText('Hiragana A row')).toBeVisible()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Hiragana A row' })).toBeVisible()
    await completeCurrentLesson(page)
    await page.reload()
    await expect(page.getByText('Hiragana K row')).toBeVisible()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Hiragana K row' })).toBeVisible()

    for (let step = 0; step < 16 && !(await page.locator('.explain-panel').count()); step += 1) {
      await page.locator('.lesson-session > button').click()
    }
    const panel = page.locator('.explain-panel')
    await expect(panel).toBeVisible()
    await panel.locator('summary').click()
    await expect(panel.getByText('Love.')).toBeVisible()
    await panel.getByRole('button', { name: 'Review Hiragana A row' }).first().click()
    await expect(page.getByRole('article', { name: 'Hiragana A row' })).toBeVisible()
    await completeCurrentLesson(page)
    await expect(page.getByRole('article', { name: 'Hiragana K row' })).toBeVisible()
    const returnedPanel = page.locator('.explain-panel')
    await expect(returnedPanel).toBeVisible()
    await returnedPanel.locator('summary').click()
    await expect(returnedPanel.getByText('Love.')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await context.close()
  }
})
