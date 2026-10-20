import { test, expect, TEST_PERSONAS } from './fixtures/dccFixtures';

test.describe('Periodic Review E2E Scenarios', () => {

  test('Scenario 1: NO_CHANGE', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.DOCUMENT_OWNER);
    
    await page.goto('/dcc/periodic-reviews');
    
    // Open own review
    await page.locator('tr').filter({ hasText: 'DOC-PD-001' }).getByRole('button', { name: 'เปิดดู' }).click();

    // Complete review
    await expect(page.getByRole('heading', { name: 'บันทึกผลการทบทวน' })).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('input[value="NO_CHANGE"]').click();
    });
    await page.fill('#review-comment', 'All good');
    await page.getByRole('button', { name: /ส่งผลให้หัวหน้าแผนก|อนุมัติผลทบทวนทันที/ }).click();

    // Verify completed - navigated to dashboard
    await expect(page).toHaveURL(/\/dcc\/periodic-reviews/);
    
    // Verify no DAR created
    await expect(page.locator('text=ดู DAR ที่เชื่อมโยง')).not.toBeVisible();
  });

  test('Scenario 2: REVISION_REQUIRED', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.DOCUMENT_OWNER);
    
    await page.goto('/dcc/periodic-reviews');
    
    // Open due review
    await page.locator('tr').filter({ hasText: 'DOC-PD-001' }).getByRole('button', { name: 'เปิดดู' }).click();

    // Select ต้องแก้ไขเอกสาร
    await expect(page.getByRole('heading', { name: 'บันทึกผลการทบทวน' })).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('input[value="REVISION_REQUIRED"]').click();
    });
    await page.fill('#review-comment', 'Needs update');
    await page.getByRole('button', { name: 'บันทึกและดำเนินการแก้ไข' }).click();

    // Expected to automatically navigate to DAR drafting
    await page.waitForURL(/\/dar\/new\/revision/);

    // Verify DAR is draft
    await expect(page).toHaveURL(/\/dar\/new\/revision/);

    // Verify returning to review shows DAR link
    await page.goto('/dcc/periodic-reviews/SCH-1');
    await expect(page.locator('button', { hasText: 'ดู DAR ที่เชื่อมโยง' })).toBeVisible();
    
    // Repeat action (Submit NO LONGER AVAILABLE since it's completed, but we can verify it's blocked/idempotent)
    await expect(page.getByRole('heading', { name: 'บันทึกผลการทบทวน' })).not.toBeVisible();
  });

  test('Scenario 3: Unauthorized Department', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.UNRELATED_DEPT);
    
    await page.goto('/dcc/periodic-reviews');

    // Verify foreign review is absent from list
    await expect(page.getByText('DOC-PD-001')).not.toBeVisible();

    // Navigate directly to the foreign review URL
    await page.goto('/dcc/periodic-reviews/SCH-1');

    // Verify Thai Access Denied
    await expect(page.locator('h2:has-text("ไม่มีสิทธิ์เข้าถึงข้อมูลการทบทวนเอกสารนี้")')).toBeVisible();

    // Verify document number and title are not present
    await expect(page.getByText('DOC-PD-001')).not.toBeVisible();
    await expect(page.getByText('Test Document PD')).not.toBeVisible();
  });

  test('Scenario 4: QAQC Monitoring', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.QAQC_MONITOR);
    
    await page.goto('/dcc/periodic-reviews');

    // Verify Control Board is default
    await expect(page.getByRole('button', { name: 'ภาพรวมทุกแผนก' })).toBeVisible();

    // Open a foreign department review (direct navigation since Control Board is a summary)
    await page.goto('/dcc/periodic-reviews/SCH-1');

    // Verify read access
    await expect(page.getByText('Test Document PD')).toBeVisible();

    // Verify edit actions are unavailable
    await expect(page.locator('input[type="radio"]').first()).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'บันทึกผลการทบทวน' })).not.toBeVisible();

    // Go back to control board
    await page.goto('/dcc/periodic-reviews');
    await page.getByRole('button', { name: 'ภาพรวมทุกแผนก' }).click();

    // Test CSV Export
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /ส่งออก CSV/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    
    // Verify CSV Content
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const csvContent = buffer.toString('utf8');
    
    expect(csvContent.length).toBeGreaterThan(0);
    // Verify UTF-8 BOM when practical - actually the browser handles it, we just check content
    expect(buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF).toBe(true);
    
    expect(csvContent).toContain('PD');
    expect(csvContent).toContain('MKT');
    expect(csvContent).toContain('DOC-PD-001');
    expect(csvContent).not.toContain('FAKE-DEPT-999');
  });

  test('Scenario 5: DCC Admin Smoke', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.DCC_ADMIN);
    
    await page.goto('/portal');
    
    // Shared nav intact
    await page.getByText('ระบบควบคุมเอกสาร (DCC)').click();
    await expect(page).toHaveURL(/\/dcc/);
    
    await page.goto('/dcc/tasks'); // Tasks
    await expect(page).toHaveURL(/\/dcc\/tasks/);

    await page.goto('/dcc/library'); // Library
    await expect(page).toHaveURL(/\/dcc\/library/);

    await page.goto('/dcc/periodic-reviews'); // Periodic reviews
    await expect(page).toHaveURL(/\/dcc\/periodic-reviews/);

    // Verify NC-CAPA and Quality Event absent
    await expect(page.getByText('NC-CAPA')).not.toBeVisible();
    await expect(page.getByText('Quality Event')).not.toBeVisible();
  });
});
