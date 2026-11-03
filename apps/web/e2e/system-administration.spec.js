import { test, expect, TEST_PERSONAS } from './fixtures/dccFixtures';

test.describe('System Administration (global /admin)', () => {
  test('admin reaches Master Data and the Audit Trail from the portal and the sidebar', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.DCC_ADMIN);
    await page.goto('/portal');

    await page.getByText('ศูนย์บริหารระบบ (System Administration)').first().click();
    await expect(page).toHaveURL(/\/admin\/master-data$/);
    await expect(page.getByText('จัดการข้อมูลหลัก (Master Data)')).toBeVisible();
    await expect(page.getByRole('group', { name: 'ข้อมูลระบบกลาง' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'ข้อมูลเฉพาะงานเอกสาร DCC' })).toBeVisible();

    await page.getByRole('link', { name: 'ประวัติการดำเนินการ (Audit Trail)' }).click();
    await expect(page).toHaveURL(/\/admin\/audit-log$/);
    await expect(page.getByTestId('centralized-audit-trail-page')).toBeVisible();

    await page.getByRole('link', { name: 'กลับสู่พอร์ทัลหลัก' }).click();
    await expect(page).toHaveURL(/\/portal$/);
  });

  test('old DCC links still work and keep the query string and hash', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.DCC_ADMIN);
    await page.goto('/dcc/admin/action-log?q=1#top');
    await expect(page).toHaveURL(/\/admin\/audit-log\?q=1#top$/);
    await expect(page.getByTestId('centralized-audit-trail-page')).toBeVisible();

    await page.goto('/dcc/admin/master-data');
    await expect(page).toHaveURL(/\/admin\/master-data$/);
  });

  test('a general user sees no admin card or menu and is sent back to the portal with a message', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.GENERAL_USER);
    await page.goto('/portal');
    await expect(page.getByText('ศูนย์บริหารระบบ (System Administration)')).toHaveCount(0);
    await expect(page.getByText('SYSTEM ADMIN')).toHaveCount(0);

    await page.goto('/admin/master-data');
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByText('คุณไม่มีสิทธิ์เข้าถึงศูนย์จัดการข้อมูลหลัก')).toBeVisible();
    await expect(page.getByText('จัดการข้อมูลหลัก (Master Data)')).toHaveCount(0);
  });
});
