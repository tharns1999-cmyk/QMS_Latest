import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import { syncVccNotifications, getLocalNotifications } from '../api/vccNotificationApi';

// Demo mode (no API): the bell list is built from the local work orders and assets.
const asset = (id, department, status = 'ACTIVE') => ({ id, asset_code: id.toUpperCase(), name: `เครื่องมือ ${id}`, department, status });
const wo = (id, assetId, dueDate, status = 'OPEN') => ({ id, wo_code: id.toUpperCase(), asset_id: assetId, due_date: dueDate, original_due_date: dueDate, status });
const seed = (assets, wos) => {
  localStorage.setItem('qms-vcc-local-assets-v1', JSON.stringify(assets));
  localStorage.setItem('qms-vcc-local-work-orders-v1', JSON.stringify(wos));
  localStorage.removeItem('qms-vcc-local-notifications-v1');
};
const as = (user) => useStore.setState({ currentUser: user, simulatedSystemDate: '2026-06-20T03:00:00.000Z', vccNotifications: [] });
const bell = () => useStore.getState().vccNotifications;

describe('VCC notifications in the shared bell (demo mode)', () => {
  beforeEach(() => {
    seed(
      [asset('qc-1', 'QC'), asset('qc-2', 'QC', 'ON_HOLD'), asset('lb-1', 'LB')],
      [wo('wo-late', 'qc-1', '2026-06-01'), wo('wo-soon', 'qc-1', '2026-06-25'), wo('wo-far', 'qc-1', '2026-12-31'), wo('wo-done', 'qc-1', '2026-01-31', 'CLOSED'), wo('wo-lb', 'lb-1', '2026-06-01')]
    );
  });

  it('lists overdue, due-soon and on-hold items of the user department only, with severity and a deep link', async () => {
    as({ id: 'u-qc', department: 'QC', approval_level: 3 });
    await syncVccNotifications();
    const byTitle = Object.fromEntries(bell().map((n) => [n.title.split(']')[0].slice(1), n]));
    expect(Object.keys(byTitle).sort()).toEqual(['เครื่องมือถูกระงับใช้/NC', 'เลยกำหนด L3', 'ใกล้ครบกำหนด'].sort());
    expect(byTitle['เลยกำหนด L3']).toMatchObject({ module: 'VCC', severity: 'CRITICAL', link: '/vcc/work-orders?wo=wo-late', isEvent: false });
    expect(byTitle['ใกล้ครบกำหนด'].severity).toBe('WARNING');
    expect(bell().some((n) => n.link.includes('wo-lb'))).toBe(false);

    as({ id: 'u-lb', department: 'LB', approval_level: 3 });
    await syncVccNotifications();
    expect(bell().map((n) => n.link)).toEqual(['/vcc/work-orders?wo=wo-lb']);
  });

  it('does not duplicate on reload, and drops an alert once the work order is closed', async () => {
    as({ id: 'u-qc', department: 'QC', approval_level: 3 });
    await syncVccNotifications();
    await syncVccNotifications();
    expect(bell()).toHaveLength(3);

    seed(JSON.parse(localStorage.getItem('qms-vcc-local-assets-v1')), [wo('wo-late', 'qc-1', '2026-06-01', 'CLOSED')]);
    localStorage.setItem('qms-vcc-local-notifications-v1', JSON.stringify([{ id: 'old', dedup_key: 'WO:wo-late:OVERDUE_L3_CRITICAL', status: 'PENDING', department: 'QC', title: '[เลยกำหนด L3] x', work_order_id: 'wo-late' }]));
    await syncVccNotifications();
    expect(bell().map((n) => n.title.split(']')[0])).toEqual(['[เครื่องมือถูกระงับใช้/NC']);
    expect(getLocalNotifications().find((n) => n.id === 'old').status).toBe('RESOLVED');
  });

  it('shows nothing to a user without VCC access', async () => {
    as({ id: 'u-wh', department: 'WH', approval_level: 3 });
    await syncVccNotifications();
    expect(bell()).toEqual([]);
  });
});
