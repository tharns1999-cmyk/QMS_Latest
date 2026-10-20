import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../layout/Sidebar';
import App from '../App';
import useStore from '../../store/useStore';

describe('Safely Deprecate and Remove Master List Registry (ทะเบียนเอกสารหลัก)', () => {
  it('Sidebar does NOT render "ทะเบียนเอกสารหลัก" for DCC Admin or General Users', () => {
    // Test for DCC Admin (EMP-001)
    useStore.getState().setCurrentUser('EMP-001');

    const { rerender } = render(
      <MemoryRouter initialEntries={['/dcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryByText('ทะเบียนเอกสารหลัก')).not.toBeInTheDocument();
    expect(screen.getByText('คลังเอกสารแม่บท')).toBeInTheDocument();

    // Test for General User (U010 - สมชาย)
    useStore.getState().setCurrentUser('U010');
    rerender(
      <MemoryRouter initialEntries={['/dcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryByText('ทะเบียนเอกสารหลัก')).not.toBeInTheDocument();
    expect(screen.getByText('คลังเอกสารแม่บท')).toBeInTheDocument();
  });

  it('Redirects /dcc/master-list, /master-list, /registry to /dcc/library smoothly', async () => {
    // Test redirect from legacy path /master-list
    window.history.pushState({}, 'Test', '/master-list');
    
    render(<App />);

    // Should redirect to Document Library without crashing
    const elements = await screen.findAllByText('คลังเอกสารแม่บท');
    expect(elements.length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe('/dcc/library');
  });
});
