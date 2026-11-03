import { test, expect, TEST_PERSONAS } from './fixtures/dccFixtures';

const OPEN_WORK_ORDER = {
  id: 'wo-kbd-1', wo_code: 'WO-KBD-001', asset_id: 'vcc-seed-st002', provider_name: 'ห้องปฏิบัติการภายนอก', planned_month: 3,
  due_date: '2026-03-31', original_due_date: '2026-03-31', status: 'OPEN', result_status: 'PENDING', nc_status: null,
  created_at: '2026-10-28T04:00:00.000Z', created_by: 'dc4', updated_at: '2026-10-28T04:00:00.000Z', updated_by: 'dc4'
};

// Walking the page with Tab must only ever stop on controls the user can see (no hidden menus, no off-screen overlays).
const tabStopsThatAreInvisible = async (page, presses) => {
  const bad = [];
  for (let i = 0; i < presses; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      // hidden = CSS-hidden, inside an sr-only (visually clipped) box, or parked far off-screen (like a closed floating menu); merely scrolled out of view is fine
      const hidden = Boolean(el.closest('.sr-only')) || getComputedStyle(el).visibility !== 'visible' || r.width <= 1 || r.height <= 1 || r.top < -5000 || r.left < -5000;
      return hidden ? `${el.tagName} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}"` : null;
    });
    if (stop) bad.push(stop);
  }
  return bad;
};

test.describe('VCC keyboard focus', () => {
  for (const route of ['/vcc/work-orders', '/vcc/assets']) {
    test(`Tab never lands on an invisible control: ${route}`, async ({ page, setupSession }) => {
      await setupSession(TEST_PERSONAS.DCC_ADMIN);
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).last()).toBeVisible();
      expect(await tabStopsThatAreInvisible(page, 150)).toEqual([]);
    });
  }

  test('work-order row menu: Enter opens it with focus inside, Escape closes it and returns focus to the button', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.DCC_ADMIN);
    // the demo store starts with no work orders for this persona, so give the table one row (and so one row menu)
    await page.addInitScript((wo) => localStorage.setItem('qms-vcc-local-work-orders-v1', JSON.stringify([wo])), OPEN_WORK_ORDER);
    await page.goto('/vcc/work-orders');
    const trigger = page.locator('button[aria-haspopup="menu"]').first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-floating-overlay]')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('DCC library row menu: Tab from the button enters the menu, Escape returns focus to the button', async ({ page, setupSession }) => {
    await setupSession(TEST_PERSONAS.DCC_ADMIN);
    await page.goto('/dcc/library');
    const trigger = page.getByRole('button', { name: 'เมนูเพิ่มเติม' }).first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.overflow-dropdown-menu')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('on a phone the drawer menu reaches every VCC view (so no hidden duplicate menu is needed)', async ({ page, setupSession }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await setupSession(TEST_PERSONAS.DCC_ADMIN);
    await page.goto('/vcc/assets');
    await page.getByRole('button', { name: 'เปิดเมนู' }).click();
    const nav = page.locator('#app-sidebar nav');
    for (const name of ['ภาพรวมและแจ้งเตือน', 'ใบสั่งงานและบันทึกผล', 'แผนการทวนสอบประจำปี', 'ทะเบียนเครื่องมือวัด', 'งานที่ต้องดำเนินการ']) {
      await expect(nav.getByRole('link', { name })).toHaveCount(1);
    }
  });
});
