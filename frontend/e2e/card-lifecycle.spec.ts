import { expect, test } from '@playwright/test'
import { authHeaders, ensureBoard, ensureUser, signInPage } from './helpers'
import type { E2EUser } from './helpers'

const apiURL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000/api/v1'

test.describe('card archive lifecycle', () => {
  test('permanently deletes an archived card from the archive', async ({ page, request }) => {
    const user = await ensureUser(request)
    const { board } = await ensureBoard(request, user)
    const title = `E2E Delete Task ${Date.now()}`
    const card = await createCard(request, user, board.id, title)
    await archiveCard(request, user, card.id)

    await signInPage(page, user)
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
  request: import('@playwright/test').APIRequestContext,
  user: E2EUser,
  boardId: number,
  title: string,
) {
  const response = await request.post(`${apiURL}/cards/`, {
    headers: authHeaders(user),
    data: { board: boardId, title },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as { id: number }
}

async function archiveCard(
  request: import('@playwright/test').APIRequestContext,
  user: E2EUser,
  cardId: number,
) {
  const response = await request.post(`${apiURL}/cards/${cardId}/archive/`, {
    headers: authHeaders(user),
  })
  expect(response.ok()).toBeTruthy()
}
