import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import App from '../../../app/App';
import Sidebar from '../../../app/layout/Sidebar';
import Topbar from '../../../app/layout/Topbar';
import PortalLandingPage from '../../portal/pages/PortalLandingPage';
import { moduleRegistry, isUserAuthorizedForModule } from '../../portal/moduleRegistry';
import useStore from '../../../store/useStore';
import { isSystemAdmin } from '../adminAccess';
import { isAdminPath } from '../adminRoutes';

const ADMIN = { id: 'ADM', name: 'DCC Admin', role: 'DCC_ADMIN', isDcc: true, department: 'DC', depts: ['DC'], level: 4 };
const DCC_STAFF = { id: 'STF', name: 'DCC Staff', role: 'DCC_STAFF', isDcc: true, department: 'DC', depts: ['DC'], level: 2 };
const GENERAL = { id: 'GEN', name: 'General User', role: 'GENERAL_USER', isDcc: false, department: 'PD', depts: ['PD'], level: 1 };
const DEPT_MANAGER = { id: 'MGR', name: 'Dept Manager', role: 'DEPT_ADMIN', isDcc: false, department: 'PD', depts: ['PD'], level: 6 };

const openApp = (url, user) => {
  useStore.setState({ currentUser: user });
  window.history.pushState({}, 'Test', url);
  return render(<App />);
};

describe('System Administration: who is an admin', () => {
  it('only system administrators pass; DCC staff, managers and general users do not', () => {
    expect(isSystemAdmin(ADMIN)).toBe(true);
    expect(isSystemAdmin({ id: 'S', role: 'SUPER_ADMIN' })).toBe(true);
    expect(isSystemAdmin(DCC_STAFF)).toBe(false);
    expect(isSystemAdmin(DEPT_MANAGER)).toBe(false);
    expect(isSystemAdmin(GENERAL)).toBe(false);
    expect(isSystemAdmin(null)).toBe(false);
  });

  it('isAdminPath matches /admin and its children only', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/audit-log')).toBe(true);
    expect(isAdminPath('/administrator')).toBe(false);
    expect(isAdminPath('/dcc/admin/master-data')).toBe(false);
  });
});

describe('System Administration: portal card', () => {
  const card = moduleRegistry.find((m) => m.moduleId === 'admin');

  it('is registered for /admin/master-data and authorised for admins only', () => {
    expect(card.route).toBe('/admin/master-data');
    expect(isUserAuthorizedForModule(card, ADMIN)).toBe(true);
    expect(isUserAuthorizedForModule(card, DCC_STAFF)).toBe(false);
    expect(isUserAuthorizedForModule(card, DEPT_MANAGER)).toBe(false);
    expect(isUserAuthorizedForModule(card, GENERAL)).toBe(false);
    expect(isUserAuthorizedForModule(card, null)).toBe(false);
  });

  const renderPortal = (user) => {
    useStore.setState({ currentUser: user });
    return render(<MemoryRouter initialEntries={['/portal']}><PortalLandingPage /></MemoryRouter>);
  };

  it('shows on the portal for an admin', () => {
    renderPortal(ADMIN);
    expect(screen.getByText('ศูนย์บริหารระบบ (System Administration)')).toBeInTheDocument();
  });

  it.each([['DCC staff', DCC_STAFF], ['general user', GENERAL]])('is hidden from a %s', (_name, user) => {
    renderPortal(user);
    expect(screen.queryByText('ศูนย์บริหารระบบ (System Administration)')).not.toBeInTheDocument();
  });
});

describe('System Administration: sidebar', () => {
  const renderSidebar = (path, user) => {
    useStore.setState({ currentUser: user });
    return render(<MemoryRouter initialEntries={[path]}><Sidebar /></MemoryRouter>);
  };

  it('admin inside /admin/* sees the SYSTEM ADMIN group and a link back to the portal, not DCC menus', () => {
    renderSidebar('/admin/audit-log', ADMIN);
    expect(screen.getByText('SYSTEM ADMIN')).toBeInTheDocument();
    expect(screen.getByText('จัดการข้อมูลหลัก').closest('a')).toHaveAttribute('href', '/admin/master-data');
    expect(screen.getByText('ประวัติการดำเนินการ (Audit Trail)').closest('a')).toHaveAttribute('href', '/admin/audit-log');
    expect(screen.getByText('กลับสู่พอร์ทัลหลัก').closest('a')).toHaveAttribute('href', '/portal');
    expect(screen.queryByText('คลังเอกสารแม่บท')).not.toBeInTheDocument();
  });

  it.each([['DCC staff', DCC_STAFF], ['general user', GENERAL], ['L6 department manager', DEPT_MANAGER]])(
    '%s never sees admin menus on the portal',
    (_name, user) => {
      renderSidebar('/portal', user);
      expect(screen.queryByText('SYSTEM ADMIN')).not.toBeInTheDocument();
      expect(screen.queryByText('จัดการข้อมูลหลัก')).not.toBeInTheDocument();
      expect(screen.queryByText('ประวัติการดำเนินการ (Audit Trail)')).not.toBeInTheDocument();
    }
  );

  it('DCC staff do not get the admin shortcuts inside DCC either', () => {
    renderSidebar('/dcc/dashboard', DCC_STAFF);
    expect(screen.queryByText('จัดการข้อมูลหลัก')).not.toBeInTheDocument();
    expect(screen.queryByText('ประวัติการดำเนินการ (Audit Trail)')).not.toBeInTheDocument();
  });
});

describe('System Administration: Topbar metadata', () => {
  // The live Layout does not mount Topbar today; these keep its titles right for when it does.
  it.each([
    ['/admin', 'ศูนย์บริหารระบบ', 'System Administration'],
    ['/admin/master-data', 'ศูนย์บริหารระบบ • ข้อมูลหลัก', 'System Administration • Master Data'],
    ['/admin/audit-log', 'ศูนย์บริหารระบบ • ประวัติการดำเนินการ', 'System Administration • Audit Trail'],
    ['/admin/audit-log/', 'ศูนย์บริหารระบบ • ประวัติการดำเนินการ', 'System Administration • Audit Trail']
  ])('%s shows its Thai title and English subtitle', (path, title, subtitle) => {
    useStore.setState({ currentUser: ADMIN });
    render(<MemoryRouter initialEntries={[path]}><Topbar /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(subtitle)).toBeInTheDocument();
  });
});

describe('System Administration: routes', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id');
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('opens Master Data for an admin with grouped tabs', async () => {
    openApp('/admin/master-data', ADMIN);
    expect(await screen.findByText('จัดการข้อมูลหลัก (Master Data)')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin/master-data');

    const core = screen.getByRole('group', { name: 'ข้อมูลระบบกลาง' });
    expect(core).toHaveTextContent('ผู้ใช้งาน (Users)');
    expect(core).toHaveTextContent('แผนก (Departments)');
    const dcc = screen.getByRole('group', { name: 'ข้อมูลเฉพาะงานเอกสาร DCC' });
    expect(dcc).toHaveTextContent('ประเภทเอกสาร (Doc Types)');
    expect(dcc).toHaveTextContent('จุดใช้งาน (Stations)');
    expect(dcc).toHaveTextContent('สายอนุมัติ & SLA');
    expect(core).not.toHaveTextContent('ประเภทเอกสาร');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('opens the Audit Trail for an admin', async () => {
    openApp('/admin/audit-log', ADMIN);
    expect(await screen.findByTestId('centralized-audit-trail-page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin/audit-log');
  });

  it('sends /admin to Master Data and keeps the query string and hash', async () => {
    openApp('/admin?from=portal#top', ADMIN);
    await screen.findByText('จัดการข้อมูลหลัก (Master Data)');
    expect(window.location.pathname).toBe('/admin/master-data');
    expect(window.location.search).toBe('?from=portal');
    expect(window.location.hash).toBe('#top');
  });

  it.each([
    ['/dcc/admin/master-data', '/admin/master-data'],
    ['/admin/master-data', '/admin/master-data'],
    ['/master-data', '/admin/master-data'],
    ['/dcc/admin/action-log', '/admin/audit-log'],
    ['/dcc/admin/audit-trail', '/admin/audit-log'],
    ['/admin/action-log', '/admin/audit-log'],
    ['/admin/audit-trail', '/admin/audit-log']
  ])('old link %s lands on %s with ?q=1#frag intact and no redirect loop', async (oldPath, target) => {
    openApp(`${oldPath}?q=1#frag`, ADMIN);
    await waitFor(() => expect(window.location.pathname).toBe(target));
    expect(window.location.search).toBe('?q=1');
    expect(window.location.hash).toBe('#frag');
    // the page for the target really rendered (so we are not bouncing between routes)
    if (target === '/admin/audit-log') {
      expect(await screen.findByTestId('centralized-audit-trail-page')).toBeInTheDocument();
    } else {
      expect(await screen.findByText('จัดการข้อมูลหลัก (Master Data)')).toBeInTheDocument();
    }
  });

  it('keeps /dcc/admin/health where it was', async () => {
    openApp('/admin/health', ADMIN);
    await waitFor(() => expect(window.location.pathname).toBe('/dcc/admin/health'));
  });

  it.each([
    ['/admin', 'คุณไม่มีสิทธิ์เข้าถึงศูนย์บริหารระบบ'],
    ['/admin/master-data', 'คุณไม่มีสิทธิ์เข้าถึงศูนย์จัดการข้อมูลหลัก'],
    ['/dcc/admin/master-data', 'คุณไม่มีสิทธิ์เข้าถึงศูนย์จัดการข้อมูลหลัก'],
    ['/admin/audit-log', 'เฉพาะผู้ดูแลระบบ (DCC Admin) เท่านั้นที่สามารถเข้าถึงประวัติการดำเนินการได้'],
    ['/dcc/admin/action-log', 'เฉพาะผู้ดูแลระบบ (DCC Admin) เท่านั้นที่สามารถเข้าถึงประวัติการดำเนินการได้']
  ])('typing %s as a non-admin shows the denied toast and returns to /portal', async (url, message) => {
    openApp(url, GENERAL);
    await waitFor(() => expect(window.location.pathname).toBe('/portal'));
    expect(errorSpy).toHaveBeenCalledWith(message, { id: 'rbac-denied-toast' });
    expect(screen.queryByText('จัดการข้อมูลหลัก (Master Data)')).not.toBeInTheDocument();
    expect(screen.queryByTestId('centralized-audit-trail-page')).not.toBeInTheDocument();
  });

  it.each([['/admin/master-data'], ['/admin/audit-log']])('DCC staff cannot open %s', async (url) => {
    openApp(url, DCC_STAFF);
    await waitFor(() => expect(window.location.pathname).toBe('/portal'));
    expect(errorSpy).toHaveBeenCalled();
    expect(screen.queryByTestId('centralized-audit-trail-page')).not.toBeInTheDocument();
  });

  it('the Master Data back button returns to the portal, not a DCC page', async () => {
    openApp('/admin/master-data', ADMIN);
    const back = await screen.findByRole('button', { name: 'กลับพอร์ทัล' });
    back.click();
    await waitFor(() => expect(window.location.pathname).toBe('/portal'));
  });
});
