import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ensureBoard, ensureUser, signInPage } from './helpers'

async function readLocalData(page: Page) {
  return page.evaluate(async () => {
    const databases = (await indexedDB.databases?.()) ?? []
    return { localStorageLength: localStorage.length, indexedDbNames: databases.map((db) => db.name) }
  })
}

test.describe('local session cleanup', () => {
  test('logout empties localStorage and IndexedDB and shows the login screen', async ({ page, request }) => {
    const user = await ensureUser(request)
    const { board } = await ensureBoard(request, user)

    await signInPage(page, user)
    await page.goto(`/lists/${board.id}`)
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('task-manager-push', 1)
          open.onupgradeneeded = () => open.result.createObjectStore('auth')
          open.onsuccess = () => {
            open.result.close()
            resolve()
          }
          open.onerror = () => reject(open.error)
        }),
    )

    const more = page.getByRole('button', { name: 'Ещё' })
    if (await more.isVisible()) await more.click()
    await page.getByRole('button', { name: 'Выйти' }).first().click()

    await expect(page).toHaveURL(/\/login/)
    expect(await readLocalData(page)).toEqual({ localStorageLength: 0, indexedDbNames: [] })
  })

  test('a 401 from the API runs the same cleanup', async ({ page, request }) => {
    const user = await ensureUser(request)
    const { board } = await ensureBoard(request, user)

    await signInPage(page, user)
    await page.goto(`/lists/${board.id}`)
    await page.route('**/api/v1/**', (route) => route.fulfill({ status: 401, json: { detail: 'Invalid token.' } }))
    await page.reload()

    await expect(page).toHaveURL(/\/login/)
    expect((await readLocalData(page)).localStorageLength).toBe(0)
  })
})
