import { expect, test } from '@playwright/test'
import { ensureBoard, ensureUser, signInPage } from './helpers'

test.describe('board archive lifecycle', () => {
  test('archives a board from the list and permanently deletes it from the archive', async ({ page, request }) => {
    const user = await ensureUser(request)
    const { board } = await ensureBoard(request, user)

    await signInPage(page, user)
    await page.goto('/boards')

    const card = page.getByRole('article').filter({ hasText: board.name })
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'В архив' }).click()

    const archiveDialog = page.getByRole('dialog')
    await expect(archiveDialog.getByText('Убрать список в архив?')).toBeVisible()
    await archiveDialog.getByRole('button', { name: 'В архив' }).click()

    await expect(page.getByRole('article').filter({ hasText: board.name })).toHaveCount(0)

    await page.goto('/archive')
    const archived = page.getByRole('article').filter({ hasText: board.name })
    await expect(archived).toBeVisible()

    await archived.getByRole('button', { name: `Удалить список «${board.name}» навсегда` }).click()

    const deleteDialog = page.getByRole('dialog')
    await expect(deleteDialog.getByText('Удалить список навсегда?')).toBeVisible()
    await expect(deleteDialog.getByText(/безвозвратно/)).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Удалить навсегда' }).click()

    await expect(page.getByRole('article').filter({ hasText: board.name })).toHaveCount(0)
  })
})
