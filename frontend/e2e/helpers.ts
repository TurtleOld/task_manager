import { expect, type APIRequestContext, type Page } from '@playwright/test'

export interface E2EUser {
  id: number
  username: string
  full_name: string
  is_admin: boolean
  role: string
  permissions: string[]
  token: string
}

export interface E2EBoard {
  id: number
  name: string
  icon: string
  color: string
}

export interface E2EColumn {
  id: number
  board: number
  name: string
}

const apiURL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000/api/v1'
const username = process.env.PLAYWRIGHT_USERNAME || 'e2e_admin'
const password = process.env.PLAYWRIGHT_PASSWORD || 'e2e_password_123'

export async function ensureUser(request: APIRequestContext): Promise<E2EUser> {
  const statusResponse = await request.get(`${apiURL}/auth/registration-status/`)
  expect(statusResponse.ok()).toBeTruthy()
  const status = await statusResponse.json() as { allow_first: boolean }

  if (status.allow_first) {
    const response = await request.post(`${apiURL}/auth/register/`, {
      data: { username, password, full_name: 'E2E Admin' },
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as E2EUser
  }

  const response = await request.post(`${apiURL}/auth/login/`, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  return await response.json() as E2EUser
}

export async function ensureBoard(request: APIRequestContext, user: E2EUser): Promise<{ board: E2EBoard; columns: E2EColumn[] }> {
  const boardName = `E2E Board ${Date.now()}`
  const boardResponse = await request.post(`${apiURL}/boards/`, {
    headers: authHeaders(user),
    data: { name: boardName, icon: '📋', color: '#2563eb' },
  })
  expect(boardResponse.ok()).toBeTruthy()
  const board = await boardResponse.json() as E2EBoard

  const columnsResponse = await request.get(`${apiURL}/columns/?board=${board.id}`, {
    headers: authHeaders(user),
  })
  expect(columnsResponse.ok()).toBeTruthy()
  const columns = await columnsResponse.json() as E2EColumn[]
  expect(columns.length).toBeGreaterThan(0)
  return { board, columns }
}

export async function signInPage(page: Page, user: E2EUser) {
  await page.addInitScript((authUser) => {
    window.localStorage.setItem('auth_token', authUser.token)
    window.localStorage.setItem('auth_user', JSON.stringify(authUser))
  }, user)
}

export function authHeaders(user: E2EUser) {
  return { Authorization: `Token ${user.token}` }
}
