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

  test('shows record, review and hold tasks; a task opens its own work order', async ({ page }) => {
    await page.goto('/vcc/tasks');
    await expect(page.getByTestId('vcc-work-task-RECORD_RESULT:wo-e2e-open')).toBeVisible();
    await expect(page.getByTestId('vcc-work-task-REVIEW_RESULT:wo-e2e-pend')).toBeVisible();
    await expect(page.getByTestId('vcc-work-task-RELEASE_HOLD:wo-e2e-hold')).toBeVisible();

    await page.getByTestId('vcc-inbox-tab-RECORD_RESULT').click();
    await expect(page.getByTestId('vcc-work-task-RECORD_RESULT:wo-e2e-open')).toBeVisible();
    await expect(page.getByTestId('vcc-work-task-REVIEW_RESULT:wo-e2e-pend')).toHaveCount(0);

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
});
