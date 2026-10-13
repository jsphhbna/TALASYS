import { expect, test } from "@playwright/test"

test("unauthenticated users cannot enter the admin verification workspace", async ({ page }) => {
  await page.goto("/admin/verifications")
  await expect(page).toHaveURL(/\/auth\/login/)
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible()
})

test("public landing and resident sign-in render without horizontal overflow", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("body")).toBeVisible()
  const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(landingOverflow).toBe(false)

  await page.goto("/auth/login")
  await expect(page.locator("body")).toBeVisible()
  const authOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(authOverflow).toBe(false)
})
