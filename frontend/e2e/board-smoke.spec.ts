import { expect, test } from '@playwright/test'
import { ensureBoard, ensureUser, signInPage } from './helpers'

test('board page creates and opens a task on desktop', async ({ page, request }) => {
  const user = await ensureUser(request)
  const { board, columns } = await ensureBoard(request, user)
  await signInPage(page, user)

  await page.goto(`/boards/${board.id}`)
  await expect(page.getByRole('heading', { name: board.name })).toBeVisible()

  const firstColumn = columns[0]
  const taskTitle = `E2E задача ${Date.now()}`
  const column = page.getByLabel(`Колонка ${firstColumn.name}`)
  await column.getByPlaceholder('Название задачи').fill(`${taskTitle} завтра`)
  await column.getByRole('button', { name: `Добавить карточку в ${firstColumn.name}` }).click()

  await expect(page.getByText('Редактирование задачи')).toBeVisible()
  await expect(page.getByRole('dialog', { name: taskTitle })).toBeVisible()
})

test('task modal opens on mobile viewport', async ({ page, request }) => {
  const user = await ensureUser(request)
  const { board, columns } = await ensureBoard(request, user)
  const firstColumn = columns[0]
  const taskTitle = `Mobile E2E ${Date.now()}`

  const cardResponse = await request.post(`${process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000/api/v1'}/cards/`, {
    headers: { Authorization: `Token ${user.token}` },
    data: { column: firstColumn.id, title: taskTitle, priority: 2 },
  })
  expect(cardResponse.ok()).toBeTruthy()

  await signInPage(page, user)
  await page.goto(`/boards/${board.id}`)
  await page.getByRole('button', { name: `Открыть задачу ${taskTitle}`, exact: true }).click()
  await expect(page.getByRole('dialog', { name: taskTitle })).toBeVisible()
})
