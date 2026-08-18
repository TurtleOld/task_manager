import { expect, test } from '@playwright/test'
import { authHeaders, ensureBoard, ensureUser, signInPage } from './helpers'
import type { E2EUser } from './helpers'

const apiURL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000/api/v1'

test.describe('task screen', () => {
  test('opens by direct link as an overlay over the agenda, shows completion and closes with Esc', async ({ page, request }) => {
    const user = await ensureUser(request)
    const { board } = await ensureBoard(request, user)
    const card = await createCard(request, user, board.id, { title: `E2E Task ${Date.now()}` })

    await signInPage(page, user)
    await page.goto(`/lists/${board.id}/tasks/${card.id}`)

    const dialog = page.getByRole('dialog', { name: card.title })
    await expect(dialog).toBeVisible()
    // The agenda route underneath is still mounted — this is an overlay, not a full navigation
    // to a task-only page. Radix marks the background inert (aria-hidden) while the dialog is open.
    await expect(page).toHaveURL(`/lists/${board.id}/tasks/${card.id}`)

    await dialog.getByRole('checkbox', { name: `Отметить задачу «${card.title}» выполненной` }).click()
    await expect(dialog.getByText(/^Выполнил\(а\) /)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page).toHaveURL(`/lists/${board.id}`)
  })

  test('completing a parent task closes its open subtasks without a reload', async ({ page, request }) => {
    const user = await ensureUser(request)
    const { board } = await ensureBoard(request, user)
    const parent = await createCard(request, user, board.id, { title: `E2E Parent ${Date.now()}` })
    const subtaskResponse = await request.post(`${apiURL}/cards/${parent.id}/subtasks/`, {
      headers: authHeaders(user),
      data: { title: 'E2E Subtask' },
    })
    expect(subtaskResponse.ok()).toBeTruthy()

    await signInPage(page, user)
    await page.goto(`/lists/${board.id}/tasks/${parent.id}`)
    const dialog = page.getByRole('dialog', { name: parent.title })

    const subtaskCheckbox = dialog.getByRole('checkbox', { name: 'Отметить подзадачу «E2E Subtask» выполненной' })
    await expect(subtaskCheckbox).toBeVisible()
    await expect(subtaskCheckbox).not.toBeChecked()

    await dialog.getByRole('checkbox', { name: `Отметить задачу «${parent.title}» выполненной` }).click()

    await expect(dialog.getByRole('checkbox', { name: 'Снять отметку с подзадачи «E2E Subtask»' })).toBeChecked()
  })

  test('checklist items can be added and marked done, and deadline changes apply without a page reload', async ({ page, request }) => {
    const user = await ensureUser(request)
    const { board } = await ensureBoard(request, user)
    const card = await createCard(request, user, board.id, { title: `E2E Checklist ${Date.now()}` })

    await signInPage(page, user)
    await page.goto(`/lists/${board.id}/tasks/${card.id}`)
    const dialog = page.getByRole('dialog', { name: card.title })

    await dialog.getByLabel('Новый пункт чек-листа').fill('Купить билеты')
    await dialog.getByLabel('Новый пункт чек-листа').press('Enter')
    const checklistRow = dialog.getByText('Купить билеты')
    await expect(checklistRow).toBeVisible()
    await checklistRow.click()
    await expect(dialog.getByText('Купить билеты')).toHaveClass(/line-through/)

    await dialog.getByRole('button', { name: 'Задать срок задачи' }).click()
    await page.getByRole('gridcell', { name: '15' }).first().click()

    // The deadline popover closes on selection; wait for its own exit animation
    // to finish before Escape, so it targets the task dialog and not the popover.
    await expect(dialog.getByRole('button', { name: 'Изменить срок задачи' })).toContainText('15 авг')
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  })
})

async function createCard(
  request: import('@playwright/test').APIRequestContext,
  user: E2EUser,
  boardId: number,
  data: Record<string, unknown>,
) {
  const response = await request.post(`${apiURL}/cards/`, {
    headers: authHeaders(user),
    data: { board: boardId, ...data },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as { id: number; title: string; board: number }
}
