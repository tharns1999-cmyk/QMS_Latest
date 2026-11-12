import { test, expect, TEST_PERSONAS } from './fixtures/dccFixtures';

const base = {
  asset_id: 'vcc-seed-st002', provider_name: 'ห้องปฏิบัติการภายนอก', planned_month: 3, due_date: '2026-03-31',
  original_due_date: '2026-03-31', result_status: 'PENDING', nc_status: null, performed_by: null,
  created_at: '2026-10-28T04:00:00.000Z', created_by: 'dc4', updated_at: '2026-10-28T04:00:00.000Z', updated_by: 'dc4'
};
const WORK_ORDERS = [
  { ...base, id: 'wo-e2e-open', wo_code: 'WO-E2E-OPEN', status: 'OPEN' },
  { ...base, id: 'wo-e2e-pend', wo_code: 'WO-E2E-PEND', status: 'PENDING_REVIEW', result_status: 'PASS', performed_by: 'someone-else' },
  { ...base, id: 'wo-e2e-hold', wo_code: 'WO-E2E-HOLD', status: 'CLOSED', result_status: 'FAIL', nc_status: 'OPEN', performed_by: 'someone-else' }
];

test.describe('VCC task inbox: work-order tasks', () => {
  test.beforeEach(async ({ page, setupSession }) => {
    await setupSession({ ...TEST_PERSONAS.DCC_ADMIN, approval_level: 5, approvalLevel: 5 }); // L5: may review and release holds
    await page.addInitScript((wos) => localStorage.setItem('qms-vcc-local-work-orders-v1', JSON.stringify(wos)), WORK_ORDERS);
  });

  test('shows record and hold tasks; a task opens its own work order', async ({ page }) => {
    await page.goto('/vcc/tasks');
    await expect(page.getByTestId('vcc-work-task-RECORD_RESULT:wo-e2e-open')).toBeVisible();
    await expect(page.getByTestId('vcc-work-task-RELEASE_HOLD:wo-e2e-hold')).toBeVisible();

    await page.getByTestId('vcc-inbox-tab-RECORD_RESULT').click();
    await expect(page.getByTestId('vcc-work-task-RECORD_RESULT:wo-e2e-open')).toBeVisible();

    await page.getByTestId('vcc-work-task-open-RECORD_RESULT:wo-e2e-open').click();
    await expect(page).toHaveURL(/\/vcc\/work-orders\?wo=wo-e2e-open$/);
    await expect(page.getByText('WO-E2E-OPEN').first()).toBeVisible();
    const closeBtn = page.getByRole('button', { name: /ปิดหน้าต่างรายละเอียด|ปิด/ }).first();
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(page).toHaveURL(/\/vcc\/work-orders$/);
  });

  test('phone width: the inbox fits the screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/vcc/tasks');
    await expect(page.getByTestId('vcc-work-task-RECORD_RESULT:wo-e2e-open')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: '.local-e2e/task-inbox-375.png', fullPage: false });
  });

  test('Work Order Deep-link supports browser back/forward and refresh without losing position', async ({ page }) => {
    await page.goto('/vcc/work-orders');
    await expect(page).toHaveURL(/\/vcc\/work-orders$/);

    // Deep link via direct URL
    await page.goto('/vcc/work-orders?wo=wo-e2e-open');
    await expect(page.getByText('WO-E2E-OPEN').first()).toBeVisible();

    // Reload page -> deep-link persists
    await page.reload();
    await expect(page.getByText('WO-E2E-OPEN').first()).toBeVisible();
    await expect(page).toHaveURL(/\/vcc\/work-orders\?wo=wo-e2e-open$/);

    // Browser back to /vcc/work-orders
    await page.goBack();
    await expect(page).toHaveURL(/\/vcc\/work-orders$/);
    await expect(page.getByRole('heading', { name: 'WO-E2E-OPEN' })).toHaveCount(0);

    // Browser forward to deep-link
    await page.goForward();
    await expect(page).toHaveURL(/\/vcc\/work-orders\?wo=wo-e2e-open$/);
    await expect(page.getByText('WO-E2E-OPEN').first()).toBeVisible();
  });

  test('Asset Deep-link supports direct URL and refresh for ACTIVE and RETIRED assets', async ({ page }) => {
    // 1. Direct URL to ACTIVE asset
    await page.goto('/vcc/assets?asset=vcc-seed-st002');
    await expect(page.locator('#asset-detail-history-title')).toBeVisible();
    await expect(page.getByText(/ST002 —/)).toBeVisible();

    // Close detail modal cleans query param
    await page.getByRole('dialog').getByRole('button', { name: 'ปิดหน้าต่าง' }).click();
    await expect(page).toHaveURL(/\/vcc\/assets$/);

    // 2. Direct URL to RETIRED asset (background tab is ACTIVE, yet modal opens correctly)
    await page.goto('/vcc/assets?asset=vcc-seed-retired');
    await expect(page.locator('#asset-detail-history-title')).toBeVisible();
    await expect(page.getByText(/T-OLD-01 —/)).toBeVisible();

    // 3. Refresh preserves modal and URL
    await page.reload();
    await expect(page.locator('#asset-detail-history-title')).toBeVisible();
    await expect(page.getByText(/T-OLD-01 —/)).toBeVisible();
    await expect(page).toHaveURL(/\/vcc\/assets\?asset=vcc-seed-retired$/);
  });
});
