import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../layout/Sidebar';
import useStore from '../../store/useStore';

// If NavItem/SectionHeader were declared inside Sidebar, every render would give React a new component type and it
// would throw away and rebuild the whole menu DOM, which resets the menu column's scroll position. Same DOM node = no remount.
const ADMIN = { id: 'ADM', name: 'DCC Admin', role: 'DCC_ADMIN', isDcc: true, department: 'DC', depts: ['DC'], level: 4 };

describe('Sidebar menu is not rebuilt on re-render (scroll position is kept)', () => {
  beforeEach(() => {
    useStore.setState({ currentUser: ADMIN });
  });

  const nodes = () => ({
    link: screen.getByText('คลังเอกสารแม่บท').closest('a'),
    other: screen.getByText('การทบทวนตามรอบ').closest('a'),
    header: screen.getByText('เอกสารภายนอก'),
    nav: document.querySelector('#app-sidebar nav')
  });

  it('keeps the same menu DOM when store data changes while the page is open', () => {
    render(<MemoryRouter initialEntries={['/dcc/dashboard']}><Sidebar /></MemoryRouter>);
    const before = nodes();
    act(() => { useStore.setState({ notifications: [], tasks: [] }); });
    act(() => { useStore.setState({ simulatedSystemDate: '2026-01-01' }); });
    const after = nodes();
    expect(after.link).toBe(before.link);
    expect(after.other).toBe(before.other);
    expect(after.header).toBe(before.header);
    expect(after.nav).toBe(before.nav);
  });

  it('keeps the same menu DOM after clicking a menu inside the module, and moves the active highlight', () => {
    render(<MemoryRouter initialEntries={['/dcc/dashboard']}><Sidebar /></MemoryRouter>);
    const before = nodes();
    fireEvent.click(before.link);
    const after = nodes();
    expect(after.link).toBe(before.link);
    expect(after.other).toBe(before.other);
    expect(after.nav).toBe(before.nav);
    expect(after.link.className).toContain('bg-blue-50');
    expect(after.other.className).not.toContain('bg-blue-50');
    fireEvent.click(after.other);
    expect(nodes().other.className).toContain('bg-blue-50');
    expect(nodes().link.className).not.toContain('bg-blue-50');
  });

  it('the VCC and System Administration menus are stable too', () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/vcc/tasks']}><Sidebar /></MemoryRouter>);
    const vccLink = screen.getByText('ทะเบียนเครื่องมือวัด').closest('a');
    act(() => { useStore.setState({ notifications: [] }); });
    expect(screen.getByText('ทะเบียนเครื่องมือวัด').closest('a')).toBe(vccLink);
    unmount();

    render(<MemoryRouter initialEntries={['/admin/master-data']}><Sidebar /></MemoryRouter>);
    const auditLink = screen.getByText('ประวัติการดำเนินการ (Audit Trail)').closest('a');
    fireEvent.click(auditLink);
    expect(screen.getByText('ประวัติการดำเนินการ (Audit Trail)').closest('a')).toBe(auditLink);
    expect(auditLink.className).toContain('bg-blue-50');
    expect(screen.getByText('จัดการข้อมูลหลัก').closest('a').className).not.toContain('bg-blue-50');
  });
});
