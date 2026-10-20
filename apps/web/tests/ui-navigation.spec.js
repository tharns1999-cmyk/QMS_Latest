import { test, expect } from '@playwright/test';

test.describe('QMS Portal Navigation & UI', () => {

  test('should load dashboard successfully', async ({ page }) => {
    await page.goto('/');
    
    // Expect the title to contain qms-portal
    await expect(page).toHaveTitle(/qms-portal/i);
    
    // Check if the dashboard welcome message is visible
    const dashboardHeader = page.locator('h2', { hasText: /ยินดีต้อนรับ/i }).first();
    await expect(dashboardHeader).toBeVisible();
  });

  test('should navigate through sidebar items', async ({ page }) => {
    await page.goto('/');

    // Navigate to Document Library
    await page.getByRole('link', { name: 'คลังเอกสาร' }).first().click();
    await expect(page).toHaveURL(/.*library/i);

    // Navigate to My Tasks
    await page.getByRole('link', { name: 'กล่องงาน (Task Inbox)' }).first().click();
    await expect(page).toHaveURL(/.*tasks/i);

    // Navigate to External Docs
    await page.getByRole('link', { name: 'External Documents' }).first().click();
    await expect(page).toHaveURL(/.*external-docs/i);
  });

  test('should have a responsive layout on mobile', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // On mobile, sidebar might be hidden behind a hamburger menu
    // We check if the main layout still renders without breaking
    const dashboardHeader = page.locator('h2', { hasText: /ยินดีต้อนรับ/i }).first();
    await expect(dashboardHeader).toBeVisible();
    
    // We can also test opening the mobile menu if there is a menu button
    const menuBtn = page.locator('button').filter({ has: page.locator('svg') }).first(); // heuristic for hamburger
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await expect(page.locator('text=คลังเอกสาร').first()).toBeVisible();
    }
  });

});
