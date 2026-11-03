import { test, expect, TEST_PERSONAS } from './fixtures/dccFixtures';

const main = (page) => page.locator('main');
const noSidewaysScroll = async (page) => {
  await main(page).evaluate((el) => { el.scrollLeft = 50; });
  expect(await main(page).evaluate((el) => el.scrollLeft)).toBeLessThanOrEqual(3);
};

test.describe('VCC round A on a phone', () => {
  test.beforeEach(async ({ page, setupSession }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupSession({ ...TEST_PERSONAS.DCC_ADMIN, approval_level: 5 });
  });

  test('register: explanations fold to one line and open on demand; the add button stays in view', async ({ page }) => {
    await page.goto('/vcc/assets');
    const summary = page.getByTestId('asset-manage-summary');
    await expect(page.getByRole('button', { name: 'เพิ่มเครื่องมือ' })).toBeVisible();
    await expect(summary).toBeHidden();
    await page.getByRole('button', { name: 'สิทธิ์ของคุณและคำอธิบาย' }).click();
    await expect(summary).toBeVisible();
    await noSidewaysScroll(page);
    await expect(page.getByRole('tab', { name: 'ใช้งานปกติ' })).toBeVisible();
  });

  test('dashboard: export buttons fold away; opening them shows the buttons', async ({ page }) => {
    await page.goto('/vcc/dashboard');
    const exportButton = page.getByTestId('vcc-export-plan-csv-btn');
    await expect(page.getByRole('button', { name: 'ส่งออกรายงานและตั้งค่า' })).toBeVisible();
    await expect(exportButton).toBeHidden();
    await page.getByRole('button', { name: 'ส่งออกรายงานและตั้งค่า' }).click();
    await expect(exportButton).toBeVisible();
    await noSidewaysScroll(page);
  });
});

test('from the md width up nothing is folded', async ({ page, setupSession }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await setupSession({ ...TEST_PERSONAS.DCC_ADMIN, approval_level: 5 });
  await page.goto('/vcc/assets');
  await expect(page.getByTestId('asset-manage-summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'สิทธิ์ของคุณและคำอธิบาย' })).toBeHidden();
});
