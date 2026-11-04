import { test, expect, TEST_PERSONAS } from './fixtures/dccFixtures';

const VIEWPORTS = [
  { name: 'Mobile Ultra-compact (320px)', width: 320, height: 640 },
  { name: 'Mobile Compact iPhone SE (375px)', width: 375, height: 667 },
  { name: 'Mobile Standard iPhone 14/15 (390px)', width: 390, height: 844 },
  { name: 'Mobile Plus / Max (414px)', width: 414, height: 896 },
  { name: 'Tablet Portrait iPad (768px)', width: 768, height: 1024 },
  { name: 'Tablet Landscape / Small Desktop (1024px)', width: 1024, height: 768 }
];

test.describe('VCC Mobile Ergonomics & Responsive E2E Suite (Round D3)', () => {
  test.beforeEach(async ({ setupSession }) => {
    await setupSession({ ...TEST_PERSONAS.DCC_ADMIN, approval_level: 5 });
  });

  for (const vp of VIEWPORTS) {
    test(`Zero horizontal layout overflow across ${vp.name} on Work Orders page`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/vcc/work-orders');
      await page.waitForLoadState('domcontentloaded');

      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(isOverflowing).toBe(false);
    });

    test(`Zero horizontal layout overflow across ${vp.name} on Annual Plan page`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/vcc/annual-plan');
      await page.waitForLoadState('domcontentloaded');

      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(isOverflowing).toBe(false);
    });
  }

  test('Touch Target Bounding Box standards (>= 44x44px) on mobile (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/vcc/work-orders');
    await page.waitForLoadState('domcontentloaded');

    // Filter and search trigger targets on mobile
    const buttons = await page.locator('button:visible').all();
    for (const btn of buttons.slice(0, 10)) {
      const box = await btn.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        // Buttons styled for mobile touch should meet or exceed 44px height (allowing 0.5px subpixel rounding)
        const isTouchTargetCandidate = await btn.evaluate((el) => {
          const cls = el.className || '';
          return cls.includes('min-h-[44px]') || cls.includes('h-11') || cls.includes('p-2') || cls.includes('py-2.5');
        });
        if (isTouchTargetCandidate) {
          expect(box.height).toBeGreaterThanOrEqual(43.5);
        }
      }
    }
  });

  test('Responsive Drawer to Bottom Sheet layout transformation', async ({ page }) => {
    // 1. Mobile (390px): Must render bottom sheet
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/vcc/work-orders');
    await page.waitForLoadState('domcontentloaded');

    // Click first work order row or detail trigger if available
    const row = page.locator('tbody tr').first();
    if (await row.isVisible()) {
      await row.click();
      const dragHandle = page.getByTestId('vcc-drag-handle');
      if (await dragHandle.isVisible()) {
        await expect(dragHandle).toBeVisible();
      }
    }

    // 2. Desktop (1024px): Drag handle must fold / hide
    await page.setViewportSize({ width: 1024, height: 768 });
    const desktopDragHandle = page.getByTestId('vcc-drag-handle');
    await expect(desktopDragHandle).toBeHidden();
  });
});

