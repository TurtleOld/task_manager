import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { apiHeaders, apiURL, ensureBoard, signIn } from './helpers'

test('legacy board address redirects to the list agenda', async ({ page }) => {
  await signIn(page)
  const { board } = await ensureBoard(page)

  await page.goto(`/boards/${board.id}`)
  await expect(page).toHaveURL(`/lists/${board.id}`)
  await expect(page.getByRole('heading', { name: board.name })).toBeVisible()
})

test('legacy card address redirects to the task address', async ({ page }) => {
  await signIn(page)
  const { board } = await ensureBoard(page)
  const card = await createCard(page, board.id)

  await page.goto(`/boards/${board.id}/cards/${card.id}`)
  await expect(page).toHaveURL(`/lists/${board.id}/tasks/${card.id}`)
  await expect(page.getByRole('dialog', { name: card.title })).toBeVisible()
})

test('legacy reminder link from an email opens the task address', async ({ page }) => {
  await signIn(page)
  const { board } = await ensureBoard(page)
  const card = await createCard(page, board.id)

  await page.goto(`/boards/${board.id}#card-${card.id}`)
  await expect(page).toHaveURL(`/lists/${board.id}/tasks/${card.id}`)
  await expect(page.getByRole('dialog', { name: card.title })).toBeVisible()
})

async function createCard(page: Page, boardId: number) {
  const response = await page.request.post(`${apiURL}/cards/`, {
    headers: await apiHeaders(page),
    data: { board: boardId, title: `E2E задача ${Date.now()}` },
  })
  expect(response.ok()).toBeTruthy()
  return await response.json() as { id: number; title: string }
}
