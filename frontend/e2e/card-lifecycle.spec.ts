import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { apiHeaders, apiURL, ensureBoard, signIn } from './helpers'

test.describe('card archive lifecycle', () => {
  test('permanently deletes an archived card from the archive', async ({ page }) => {
    await signIn(page)
    const { board } = await ensureBoard(page)
    const title = `E2E Delete Task ${Date.now()}`
    const card = await createCard(page, board.id, title)
    await archiveCard(page, card.id)

    await page.goto('/archive')

    const archived = page.getByRole('article').filter({ hasText: title })
    await expect(archived).toBeVisible()

    await archived.getByRole('button', { name: `Удалить задачу «${title}» навсегда` }).press('Enter')

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Удалить задачу навсегда?')).toBeVisible()
    await expect(dialog.getByText(/безвозвратно/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Удалить навсегда' }).click()

    await expect(page.getByRole('article').filter({ hasText: title })).toHaveCount(0)
  })
})

async function createCard(
  page: Page,
  boardId: number,
  title: string,
) {
  const response = await page.request.post(`${apiURL}/cards/`, {
    headers: await apiHeaders(page),
    data: { board: boardId, title },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as { id: number }
}

async function archiveCard(
  page: Page,
  cardId: number,
) {
  const response = await page.request.post(`${apiURL}/cards/${cardId}/archive/`, {
    headers: await apiHeaders(page),
  })
  expect(response.ok()).toBeTruthy()
}
