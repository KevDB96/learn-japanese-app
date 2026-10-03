import { expect, test } from '@playwright/test'

test('optional card teaching material returns to the same flashcard queue in both profiles', async ({ browser }) => {
  for (const profile of ['kevin', 'janne'] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await page.goto('/learn-japanese-app/')
    if (await page.getByRole('heading', { name: 'Choose a profile' }).count()) await page.getByRole('button', { name: profile === 'kevin' ? /Kevin/ : /Janne/ }).click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', profile)
    const card = page.locator('.kana-review')
    await expect(card).toBeVisible()
    const id = await card.getAttribute('data-card-id')
    await card.getByRole('button', { name: 'Show answer' }).click()
    await expect(card.getByRole('button', { name: 'Learn more' })).toBeVisible()
    await card.getByRole('button', { name: 'Learn more' }).click()
    await expect(page.getByRole('region', { name: 'Card explanation' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to card' }).click()
    await expect(page.locator('.kana-review')).toHaveAttribute('data-card-id', id!)
    await expect(page.locator('.kana-review')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await context.close()
  }
})
