import { test, expect, TEST_PERSONAS } from './fixtures/dccFixtures';

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
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await tabStopsThatAreInvisible(page, 150)).toEqual([]);
    });
  }
});
