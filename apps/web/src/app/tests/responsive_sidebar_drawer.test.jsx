import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import Layout from '../layout/Layout';
import Sidebar from '../layout/Sidebar';
import useStore from '../../store/useStore';

// jsdom has no media queries, so these tests check the state/ARIA contract and the breakpoint classes.
// Below lg (1024px) the sidebar is an off-canvas drawer; from lg up it is the same static column as before.
const renderLayout = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/portal" element={<div>หน้าพอร์ทัล <Link to="/vcc/assets">ไป VCC</Link></div>} />
          <Route path="/dcc/dashboard" element={<div>หน้า DCC</div>} />
          <Route path="/vcc/assets" element={<div>หน้า VCC</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

const drawer = () => document.getElementById('app-sidebar');

describe('Responsive shared sidebar (drawer below 1024px, unchanged on desktop)', () => {
  beforeEach(() => {
    useStore.getState().setCurrentUser('EMP-001');
  });

  it('1. Drawer starts closed on small screens, with an accessible menu button', () => {
    renderLayout('/portal');
    const btn = screen.getByRole('button', { name: 'เปิดเมนู' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls', 'app-sidebar');
    expect(drawer().className).toContain('-translate-x-full');
    // Closed drawer must not be reachable by keyboard on small screens, yet stay visible on desktop
    expect(drawer().className).toContain('invisible');
    expect(drawer().className).toContain('lg:visible');
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });

  it('2. Menu button opens the drawer with a backdrop; close button, backdrop and Escape close it', () => {
    renderLayout('/portal');
    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนู' }));
    expect(drawer().className).toContain('translate-x-0');
    expect(drawer().className).not.toContain('-translate-x-full');
    expect(screen.getByRole('button', { name: 'ปิดเมนู' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sidebar-backdrop'));
    expect(drawer().className).toContain('-translate-x-full');

    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนู' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer().className).toContain('-translate-x-full');

    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนู' }));
    fireEvent.click(screen.getByRole('button', { name: 'ปิดเมนูด้านข้าง' }));
    expect(drawer().className).toContain('-translate-x-full');
  });

  it('3. Navigating closes the drawer', () => {
    renderLayout('/portal');
    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนู' }));
    fireEvent.click(screen.getByText('ไป VCC'));
    expect(screen.getByText('หน้า VCC')).toBeInTheDocument();
    expect(drawer().className).toContain('-translate-x-full');
  });

  it('4. Desktop contract: static column at lg with fixed 264px width and no backdrop or menu bar', () => {
    renderLayout('/portal');
    const cls = drawer().className;
    expect(cls).toContain('lg:static');
    expect(cls).toContain('lg:translate-x-0');
    expect(cls).toContain('sm:w-[264px]');
    expect(cls).toContain('shrink-0');
    expect(screen.getByRole('button', { name: 'เปิดเมนู' }).closest('header').className).toContain('lg:hidden');
  });

  it('5. Portal and DCC menus are intact inside the drawer', () => {
    renderLayout('/portal');
    expect(screen.getByText('ภาพรวมพอร์ทัล')).toBeInTheDocument();
    expect(screen.queryByText('คลังเอกสารแม่บท')).not.toBeInTheDocument();
  });

  it('6. DCC route keeps its full menu and the drawer behaves the same', () => {
    renderLayout('/dcc/dashboard');
    expect(screen.getByText('กลับสู่พอร์ทัลหลัก')).toBeInTheDocument();
    expect(screen.getByText('คลังเอกสารแม่บท')).toBeInTheDocument();
    expect(screen.getByText('ยื่นคำร้อง DAR')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'เปิดเมนู' }));
    expect(drawer().className).toContain('translate-x-0');
  });

  it('7. Sidebar alone (old usage without props) still renders as a normal column', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('คลังเอกสารแม่บท')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ปิดเมนูด้านข้าง' })).toBeInTheDocument();
  });
});
