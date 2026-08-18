import { expect, test } from '@playwright/test'
import { ensureBoard, ensureUser, signInPage } from './helpers'

test.skip('can add a deadline reminder interval on a task (disabled until the task screen lands)', async ({ page, request }) => {
  const user = await ensureUser(request)
  const { board } = await ensureBoard(request, user)
  const taskTitle = `Reminder E2E ${Date.now()}`

  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const cardResponse = await request.post(`${process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000/api/v1'}/cards/`, {
    headers: { Authorization: `Token ${user.token}` },
    data: { board: board.id, title: taskTitle, priority: 2, deadline },
  })
  expect(cardResponse.ok()).toBeTruthy()

  await signInPage(page, user)
  await page.goto(`/boards/${board.id}`)
  await page.getByRole('button', { name: `Открыть задачу ${taskTitle}`, exact: true }).click()
  await expect(page.getByRole('dialog', { name: taskTitle })).toBeVisible()

  const dialog = page.getByRole('dialog', { name: taskTitle })
  await expect(dialog.getByText('Установите срок выполнения, чтобы настроить напоминание.')).not.toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Добавить интервал' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Добавить интервал' }).click()
  await expect(dialog.getByText('Активно: 1')).toBeVisible()
  await expect(dialog.getByLabel('Включено')).toBeChecked()
  await expect(dialog.getByText('Канал доставки')).toHaveCount(0)
})
