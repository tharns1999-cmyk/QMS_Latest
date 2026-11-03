import { test, expect, TEST_PERSONAS } from './fixtures/dccFixtures';

// A short window makes the sidebar's nav column scroll; clicking a menu must not throw it back to the top.
const navScrollTop = (page) => page.evaluate(() => document.querySelector('#app-sidebar nav').scrollTop);
// Put the link in view first so Playwright does not scroll the menu itself before clicking; then the position is the user's own.
const scrollLinkIntoView = (link) => link.evaluate((el) => {
  // Scroll only the menu column (scrollIntoView could also move its overflow-hidden parents)
  const nav = document.querySelector('#app-sidebar nav');
  nav.scrollTop += el.getBoundingClientRect().bottom - nav.getBoundingClientRect().bottom + 8;
  return nav.scrollTop;
});

// A mouse click at the link's position: Playwright's own link.click() scrolls the menu first and would hide what we measure.
const isInsideMenu = async (page, link) => {
  const box = await link.boundingBox();
  const nav = await page.locator('#app-sidebar nav').boundingBox();
  return box.y >= nav.y && box.y + box.height <= nav.y + nav.height;
};
const clickLikeAUser = async (page, link) => {
  if (!(await isInsideMenu(page, link))) throw new Error('link is not inside the visible menu column; the test window is too small');
  const box = await link.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const MODULES = [
  { name: 'DCC', start: '/dcc/dashboard', click: 'การทบทวนตามรอบ', url: /\/dcc\/periodic-reviews/ },
  { name: 'VCC', start: '/vcc/tasks', click: 'ทะเบียนเครื่องมือวัด', url: /\/vcc\/assets/ },
  { name: 'System Administration', start: '/admin/master-data', click: 'ประวัติการดำเนินการ (Audit Trail)', url: /\/admin\/audit-log/ }
];

for (const viewport of [{ label: 'desktop', width: 1280, height: 540 }, { label: 'tablet', width: 1024, height: 540 }]) {
  for (const mod of MODULES) {
    test(`${mod.name} sidebar keeps its scroll position after a click (${viewport.label})`, async ({ page, setupSession }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupSession(TEST_PERSONAS.DCC_ADMIN);
      await page.goto(mod.start);
      const link = page.locator('#app-sidebar nav').getByRole('link', { name: mod.click });
      await expect(link).toBeVisible();

      const before = await scrollLinkIntoView(link);
      test.skip(before === 0, 'sidebar does not scroll at this size');
      await clickLikeAUser(page, link);
      await expect(page).toHaveURL(mod.url);
      // the active item is highlighted after the move
      await expect(page.locator('#app-sidebar nav a.bg-blue-50', { hasText: mod.click })).toBeVisible();
      expect(await navScrollTop(page)).toBe(before);

      // Back and Forward inside the module keep it too
      await page.goBack();
      await expect(page).not.toHaveURL(mod.url);
      expect(await navScrollTop(page)).toBe(before);
      await page.goForward();
      await expect(page).toHaveURL(mod.url);
      expect(await navScrollTop(page)).toBe(before);
    });
  }
}

test('mobile drawer: scroll position survives a menu click and the drawer still opens and closes', async ({ page, setupSession }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await setupSession(TEST_PERSONAS.DCC_ADMIN);
  await page.goto('/dcc/dashboard');
  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  const link = page.locator('#app-sidebar nav').getByRole('link', { name: 'การทบทวนตามรอบ' });
  await expect(link).toBeVisible();
  // The drawer slides in over 200ms and its footer can still grow, shrinking the menu column; measure until both have settled, or the click misses
  let before;
  await expect(async () => {
    expect(await page.locator('#app-sidebar').evaluate((el) => el.getBoundingClientRect().x)).toBe(0);
    before = await scrollLinkIntoView(link);
    expect(await isInsideMenu(page, link)).toBe(true);
  }).toPass();
  test.skip(before === 0, 'sidebar does not scroll at this size');
  await clickLikeAUser(page, link);
  await expect(page).toHaveURL(/\/dcc\/periodic-reviews/);
  // choosing a page closes the drawer; reopening it shows the same place
  await expect(page.getByRole('button', { name: 'เปิดเมนู' })).toBeVisible();
  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  await expect(page.getByRole('button', { name: 'ปิดเมนู' }).first()).toBeVisible();
  expect(await navScrollTop(page)).toBe(before);
});
