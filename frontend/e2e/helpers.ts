import { expect, type BrowserContext, type Page } from '@playwright/test'

export interface E2EUser {
  id: number
  username: string
  full_name: string
  is_admin: boolean
  role: string
}

export interface E2EBoard {
  id: number
  name: string
  icon: string
  color: string
}

export interface Credentials {
  username: string
  password: string
  full_name: string
}

export const apiURL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000/api/v1'

export const admin: Credentials = {
  username: process.env.PLAYWRIGHT_USERNAME || 'e2e_admin',
  password: process.env.PLAYWRIGHT_PASSWORD || 'e2e_password_123',
  full_name: 'E2E Admin',
}

/** CSRF header for API calls made with the browser context's cookies. */
export async function apiHeaders(page: Page): Promise<Record<string, string>> {
  return { 'X-CSRFToken': await csrfCookie(page.context()) }
}

async function csrfCookie(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies(apiURL)
  return cookies.find((cookie) => cookie.name === 'csrftoken')?.value ?? ''
}

/**
 * Sign the page's browser context in through the real login endpoint, so the
 * app starts with the same HttpOnly session cookie a person would have.
 * The very first run registers the admin instead.
 */
export async function signIn(page: Page, credentials: Credentials = admin): Promise<E2EUser> {
  const request = page.request
  expect((await request.get(`${apiURL}/auth/csrf/`)).ok()).toBeTruthy()

  const status = await (await request.get(`${apiURL}/auth/registration-status/`)).json() as { allow_first: boolean }
  const path = status.allow_first && credentials === admin ? 'register' : 'login'
  const response = await request.post(`${apiURL}/auth/${path}/`, {
    headers: await apiHeaders(page),
    data: credentials,
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return await response.json() as E2EUser
}

/** Create a member account as the signed-in admin; an existing one is reused. */
export async function ensureMember(page: Page, credentials: Credentials): Promise<void> {
  const response = await page.request.post(`${apiURL}/auth/register/`, {
    headers: await apiHeaders(page),
    data: { ...credentials, role: 'member' },
  })
  if (!response.ok()) {
    expect(response.status()).toBe(400)
  }
}

export async function ensureBoard(page: Page): Promise<{ board: E2EBoard }> {
  const boardName = `E2E Board ${Date.now()}`
  const boardResponse = await page.request.post(`${apiURL}/boards/`, {
    headers: await apiHeaders(page),
    data: { name: boardName, icon: '📋', color: '#2563eb' },
  })
  expect(boardResponse.ok()).toBeTruthy()
  const board = await boardResponse.json() as E2EBoard
  return { board }
}
