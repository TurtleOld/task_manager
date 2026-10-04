import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { apiHeaders, apiURL, ensureBoard, ensureMember, signIn } from './helpers'

const member = { username: 'e2e_member', password: 'e2e_member_pass_123', full_name: 'E2E Member' }

async function readLocalData(page: Page) {
  return page.evaluate(async () => {
    const databases = (await indexedDB.databases?.()) ?? []
    return { localStorageLength: localStorage.length, indexedDbNames: databases.map((db) => db.name) }
  })
}

async function logOutThroughUi(page: Page) {
  const more = page.getByRole('button', { name: 'Ещё' })
  if (await more.isVisible()) await more.dispatchEvent('click')
  await page.getByRole('button', { name: 'Выйти' }).first().dispatchEvent('click')
}

async function uploadAttachment(page: Page, cardId: number, text: string): Promise<string> {
  const response = await page.request.post(`${apiURL}/cards/${cardId}/attachments/`, {
    headers: await apiHeaders(page),
    multipart: { type: 'file', files: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from(text) } },
  })
  expect(response.ok()).toBeTruthy()
  const card = await response.json() as { attachments: { name: string; url: string }[] }
  const url = card.attachments.find((item) => item.name === 'note.txt')!.url
  return new URL(url, apiURL).href
}

test.describe('local session cleanup', () => {
  test('signing out A and in as B leaves nothing of A behind', async ({ page, browser, playwright }) => {
    await signIn(page)
    await ensureMember(page, member)
    const { board } = await ensureBoard(page)
    const cardResponse = await page.request.post(`${apiURL}/cards/`, {
      headers: await apiHeaders(page),
      data: { board: board.id, title: `E2E вложение ${Date.now()}` },
    })
    const card = await cardResponse.json() as { id: number }
    const attachmentText = `attachment ${Date.now()}`
    const attachmentUrl = await uploadAttachment(page, card.id, attachmentText)
    const deviceLabel = `E2E device ${Date.now()}`
    const device = await page.request.post(`${apiURL}/push-devices/`, {
      headers: await apiHeaders(page),
      data: {
        endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${Date.now()}`,
        keys: { p256dh: 'p256dh', auth: 'auth' },
        label: deviceLabel,
      },
    })
    expect(device.ok()).toBeTruthy()
    const sessionA = (await page.context().cookies()).find((cookie) => cookie.name === 'sessionid')!

    const attachment = await page.request.get(attachmentUrl)
    expect(attachment.status()).toBe(200)
    expect(await attachment.text()).toBe(attachmentText)
    expect(attachment.headers()['content-disposition']).toContain('attachment')

    await page.goto(`/lists/${board.id}`)
    await expect(page.getByRole('heading', { name: board.name })).toBeVisible()
    await logOutThroughUi(page)

    await expect(page).toHaveURL(/\/login/)
    expect(await readLocalData(page)).toEqual({ localStorageLength: 0, indexedDbNames: [] })

    const withOldCookie = await playwright.request.newContext({
      extraHTTPHeaders: { Cookie: `sessionid=${sessionA.value}` },
    })
    expect((await withOldCookie.get(`${apiURL}/auth/me/`)).status()).toBe(401)
    await withOldCookie.dispose()

    await page.getByLabel('Логин').fill(member.username)
    await page.getByLabel('Пароль').fill(member.password)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto('/settings')
    await expect(page.locator('#account-full-name')).toHaveValue(member.full_name)

    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await signIn(adminPage)
    const devices = await (await adminPage.request.get(`${apiURL}/push-devices/`)).json() as { label: string }[]
    expect(devices.map((item) => item.label)).not.toContain(deviceLabel)
    await adminContext.close()
  })

  test('terminating all sessions logs the other context out with full cleanup', async ({ browser }) => {
    const firstContext = await browser.newContext()
    const firstPage = await firstContext.newPage()
    await signIn(firstPage)
    const { board } = await ensureBoard(firstPage)

    const secondContext = await browser.newContext()
    const secondPage = await secondContext.newPage()
    await signIn(secondPage)
    await secondPage.goto(`/lists/${board.id}`)
    await expect(secondPage.getByRole('heading', { name: board.name })).toBeVisible()

    await firstPage.goto('/settings')
    await firstPage.getByRole('button', { name: 'Завершить все сеансы' }).click()
    await expect(firstPage).toHaveURL(/\/login/)

    await secondPage.reload()
    await expect(secondPage).toHaveURL(/\/login/)
    expect(await readLocalData(secondPage)).toEqual({ localStorageLength: 0, indexedDbNames: [] })

    await firstContext.close()
    await secondContext.close()
  })

  test('a 401 from the API runs the same cleanup', async ({ page }) => {
    await signIn(page)
    const { board } = await ensureBoard(page)

    await page.goto(`/lists/${board.id}`)
    await expect(page).toHaveURL(`/lists/${board.id}`)
    await page.route('**/api/v1/**', (route) => route.fulfill({ status: 401, json: { detail: 'Not authenticated.' } }))
    await page.reload()

    await expect(page).toHaveURL(/\/login/)
    expect((await readLocalData(page)).localStorageLength).toBe(0)
  })

  test('terminating one session logs only that device out', async ({ browser }) => {
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await signIn(adminPage)
    await ensureMember(adminPage, member)
    await adminContext.close()

    const firstContext = await browser.newContext()
    const firstPage = await firstContext.newPage()
    await signIn(firstPage, member)
    await firstPage.request.post(`${apiURL}/auth/terminate-sessions/`, { headers: await apiHeaders(firstPage) })
    await signIn(firstPage, member)

    const secondContext = await browser.newContext()
    const secondPage = await secondContext.newPage()
    await signIn(secondPage, member)
    await secondPage.goto('/')
    await expect(secondPage).not.toHaveURL(/\/login/)

    await firstPage.goto('/settings')
    const endButtons = firstPage.getByRole('button', { name: 'Завершить', exact: true })
    await expect(endButtons).toHaveCount(1)
    await endButtons.click()
    await expect(endButtons).toHaveCount(0)

    await secondPage.reload()
    await expect(secondPage).toHaveURL(/\/login/)
    expect(await readLocalData(secondPage)).toEqual({ localStorageLength: 0, indexedDbNames: [] })

    await firstContext.close()
    await secondContext.close()
  })
})
