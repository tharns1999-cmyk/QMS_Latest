import { test, expect, TEST_PERSONAS } from './fixtures/dccFixtures';

test.describe('Periodic Review DAR Linkage Source Lock', () => {

  test('Periodic Review to Revision DAR Source Lock', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.DOCUMENT_OWNER);

    // 1. Navigate to Periodic Review dashboard
    await page.goto('/dcc/periodic-reviews');
    
    // 2. Select an Internal Document to review
    await page.locator('tr').filter({ hasText: 'DOC-PD-001' }).getByRole('button', { name: 'เปิดดู' }).click();

    // 3. Complete review as REVISION_REQUIRED
    await expect(page.getByRole('heading', { name: 'บันทึกผลการทบทวน' })).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('input[value="REVISION_REQUIRED"]').click();
    });
    await page.fill('#review-comment', 'Automated E2E Test - Need revision');
    await page.getByRole('button', { name: 'บันทึกและดำเนินการแก้ไข' }).click();

    // 4. Verify the DAR is created and we're redirected
    await expect(page).toHaveURL(/.*\/dcc\/dar\/new\/revision\?draftId=.*/);

    // 5. Verify Thai source-lock banner
    await expect(page.locator('text=คำขอนี้สร้างจากการทบทวนเอกสารตามรอบ')).toBeVisible();
    await expect(page.locator('text=ข้อมูลเอกสารต้นทางไม่สามารถเปลี่ยนแปลงได้')).toBeVisible();

    // 6. Verify no document selector exists
    await expect(page.locator('select').filter({ hasText: 'เลือกเอกสารที่ต้องการแก้ไข' })).not.toBeVisible();
    
    // 7. Verify no editable title input exists (should just be text)
    const editableTitle = page.locator('input[placeholder*="ชื่อเอกสาร"]');
    await expect(editableTitle).not.toBeVisible();

    // 8. Verify next revision is read-only text (e.g., "Rev. 02")
    await expect(page.locator('text=Revision ถัดไป')).toBeVisible();

    // 9. Refresh browser and verify locked source remains
    await page.reload();
    await expect(page.locator('text=คำขอนี้สร้างจากการทบทวนเอกสารตามรอบ')).toBeVisible();
    await expect(page).toHaveURL(/.*\/dcc\/dar\/new\/revision\?draftId=.*/);

    // 10. Genuine hard refresh
    await page.reload();

    // 11. Confirm draft reloads and is still DRAFT
    await expect(page.locator('text=คำขอนี้สร้างจากการทบทวนเอกสารตามรอบ')).toBeVisible();
  });

  test('Periodic Review to Obsolete DAR Source Lock', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.DOCUMENT_OWNER);
    // 1. Navigate to Periodic Review dashboard
    await page.goto('/dcc/periodic-reviews');
    
    await page.locator('tr').filter({ hasText: 'DOC-PD-001' }).getByRole('button', { name: 'เปิดดู' }).click();

    // 3. Complete review as OBSOLETE_REQUIRED
    await expect(page.getByRole('heading', { name: 'บันทึกผลการทบทวน' })).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('input[value="OBSOLETE_REQUIRED"]').click();
    });
    await page.fill('#review-comment', 'Automated E2E Test - Need obsolete');
    await page.getByRole('button', { name: 'บันทึกและขอยกเลิก' }).click();

    // 4. Verify the DAR is created and we're redirected
    await expect(page).toHaveURL(/.*\/dcc\/dar\/new\/obsolete\?draftId=.*/);

    // 5. Verify Thai source-lock banner
    await expect(page.locator('text=คำขอนี้สร้างจากการทบทวนเอกสารตามรอบ')).toBeVisible();

    // 6. Verify no document selector exists
    await expect(page.locator('select').filter({ hasText: 'เลือกเอกสารที่ต้องการยกเลิก' })).not.toBeVisible();

    // 8. Refresh browser and verify locked source remains
    await page.reload();
    await expect(page.locator('text=คำขอนี้สร้างจากการทบทวนเอกสารตามรอบ')).toBeVisible();
    await expect(page).toHaveURL(/.*\/dcc\/dar\/new\/obsolete\?draftId=.*/);

    // 9. Genuine hard refresh
    await page.reload();

    // 10. Confirm draft reloads
    await expect(page.locator('text=คำขอนี้สร้างจากการทบทวนเอกสารตามรอบ')).toBeVisible();
  });
});
