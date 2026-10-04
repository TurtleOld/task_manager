import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { apiHeaders, apiURL, ensureBoard, signIn } from './helpers'

test.describe('task screen', () => {
  test('opens by direct link as an overlay over the agenda, shows completion and closes with Esc', async ({ page }) => {
    await signIn(page)
    const { board } = await ensureBoard(page)
    const card = await createCard(page, board.id, { title: `E2E Task ${Date.now()}` })

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

  test('completing a parent task closes its open subtasks without a reload', async ({ page }) => {
    await signIn(page)
    const { board } = await ensureBoard(page)
    const parent = await createCard(page, board.id, { title: `E2E Parent ${Date.now()}` })
    const subtaskResponse = await page.request.post(`${apiURL}/cards/${parent.id}/subtasks/`, {
      headers: await apiHeaders(page),
      data: { title: 'E2E Subtask' },
    })
    expect(subtaskResponse.ok()).toBeTruthy()

    await page.goto(`/lists/${board.id}/tasks/${parent.id}`)
    const dialog = page.getByRole('dialog', { name: parent.title })

    const subtaskCheckbox = dialog.getByRole('checkbox', { name: 'Отметить подзадачу «E2E Subtask» выполненной' })
    await expect(subtaskCheckbox).toBeVisible()
    await expect(subtaskCheckbox).not.toBeChecked()

    await dialog.getByRole('checkbox', { name: `Отметить задачу «${parent.title}» выполненной` }).click()

    await expect(dialog.getByRole('checkbox', { name: 'Снять отметку с подзадачи «E2E Subtask»' })).toBeChecked()
  })

  test('checklist items can be added and marked done, and deadline changes apply without a page reload', async ({ page }) => {
    await signIn(page)
    const { board } = await ensureBoard(page)
    const card = await createCard(page, board.id, { title: `E2E Checklist ${Date.now()}` })

    await page.goto(`/lists/${board.id}/tasks/${card.id}`)
    const dialog = page.getByRole('dialog', { name: card.title })

    await dialog.getByRole('button', { name: 'Чек-лист' }).click()
    await dialog.getByLabel('Новый пункт чек-листа').fill('Купить билеты')
    await dialog.getByLabel('Новый пункт чек-листа').press('Enter')
    const checklistRow = dialog.getByText('Купить билеты')
    await expect(checklistRow).toBeVisible()
    await checklistRow.click()
    await expect(dialog.getByText('Купить билеты')).toHaveClass(/line-through/)

    await dialog.getByRole('button', { name: 'Задать срок задачи' }).click()
    const dayCell = page.getByRole('gridcell', { name: '15' }).first()
    const isoDay = await dayCell.getAttribute('data-day')
    expect(isoDay).toBeTruthy()
    await dayCell.click()

    // The calendar opens on the current month, so the label is derived from the
    // date that was actually clicked instead of a hardcoded month.
    const [year, month, dayOfMonth] = isoDay!.split('-').map(Number)
    const expectedDayLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
      .format(new Date(year, month - 1, dayOfMonth))

    // The deadline popover closes on selection; wait for its own exit animation
    // to finish before Escape, so it targets the task dialog and not the popover.
    await expect(dialog.getByRole('button', { name: 'Изменить срок задачи' })).toContainText(expectedDayLabel)
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  })
})

async function createCard(
  page: Page,
  boardId: number,
  data: Record<string, unknown>,
) {
  const response = await page.request.post(`${apiURL}/cards/`, {
    headers: await apiHeaders(page),
    data: { board: boardId, ...data },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as { id: number; title: string; board: number }
}
