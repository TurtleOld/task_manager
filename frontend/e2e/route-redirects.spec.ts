import { expect, test } from '@playwright/test'
import { ensureBoard, ensureUser, signInPage } from './helpers'

const apiURL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000/api/v1'

test('legacy board address redirects to the list agenda', async ({ page, request }) => {
  const user = await ensureUser(request)
  const { board } = await ensureBoard(request, user)
  await signInPage(page, user)

  await page.goto(`/boards/${board.id}`)
  await expect(page).toHaveURL(`/lists/${board.id}`)
  await expect(page.getByRole('heading', { name: board.name })).toBeVisible()
})

test('legacy card address redirects to the task address', async ({ page, request }) => {
  const user = await ensureUser(request)
  const { board } = await ensureBoard(request, user)
  const card = await createCard(request, user.token, board.id)

  await signInPage(page, user)
  await page.goto(`/boards/${board.id}/cards/${card.id}`)
  await expect(page).toHaveURL(`/lists/${board.id}/tasks/${card.id}`)
  await expect(page.getByRole('dialog', { name: card.title })).toBeVisible()
})

test('legacy reminder link from an email opens the task address', async ({ page, request }) => {
  const user = await ensureUser(request)
  const { board } = await ensureBoard(request, user)
  const card = await createCard(request, user.token, board.id)

  await signInPage(page, user)
  await page.goto(`/boards/${board.id}#card-${card.id}`)
  await expect(page).toHaveURL(`/lists/${board.id}/tasks/${card.id}`)
  await expect(page.getByRole('dialog', { name: card.title })).toBeVisible()
})

async function createCard(request: import('@playwright/test').APIRequestContext, token: string, boardId: number) {
  const response = await request.post(`${apiURL}/cards/`, {
    headers: { Authorization: `Token ${token}` },
    data: { board: boardId, title: `E2E задача ${Date.now()}` },
  })
  expect(response.ok()).toBeTruthy()
  return await response.json() as { id: number; title: string }
}
