import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../layout/Sidebar';
import useStore from '../../store/useStore';

describe('Sidebar Active State & Highlight Precision Verification', () => {
  beforeEach(() => {
    // Reset to DCC Admin user for full menu privileges
    useStore.getState().setCurrentUser('EMP-001');
  });

  it('1. When navigating to /dcc/library, "คลังเอกสารแม่บท" is active while "ยื่นคำร้อง DAR" is strictly inactive', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/library']}>
        <Sidebar />
      </MemoryRouter>
    );

    const libraryLink = screen.getByRole('link', { name: /คลังเอกสารแม่บท/i });
    const darCreateLink = screen.getByRole('link', { name: /ยื่นคำร้อง DAR/i });

    // Active link has blue active styling
    expect(libraryLink.className).toContain('bg-blue-50');
    expect(libraryLink.className).toContain('text-blue-700');

    // Inactive "ยื่นคำร้อง DAR" MUST NOT have ghost active or blue highlight
    expect(darCreateLink.className).not.toContain('bg-blue-50');
    expect(darCreateLink.className).not.toContain('text-blue-600');
    expect(darCreateLink.className).not.toContain('text-blue-700');
    expect(darCreateLink.className).toContain('text-slate-600');
    expect(darCreateLink.className).toContain('bg-transparent');
  });

  it('2. When navigating to /dcc/tasks, "กล่องงานที่ต้องทำ" is active while "ยื่นคำร้อง DAR" is inactive', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/tasks']}>
        <Sidebar />
      </MemoryRouter>
    );

    const tasksLink = screen.getByRole('link', { name: /กล่องงานที่ต้องทำ/i });
    const darCreateLink = screen.getByRole('link', { name: /ยื่นคำร้อง DAR/i });

    expect(tasksLink.className).toContain('bg-blue-50');
    expect(tasksLink.className).toContain('text-blue-700');

    expect(darCreateLink.className).not.toContain('bg-blue-50');
    expect(darCreateLink.className).toContain('text-slate-600');
    expect(darCreateLink.className).toContain('bg-transparent');
  });

  it('3. When navigating to /dcc/dar/list, "ติดตามคำร้องของฉัน" is active while "ยื่นคำร้อง DAR" is inactive', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/dar/list']}>
        <Sidebar />
      </MemoryRouter>
    );

    const darListLink = screen.getByRole('link', { name: /ติดตามคำร้องของฉัน/i });
    const darCreateLink = screen.getByRole('link', { name: /ยื่นคำร้อง DAR/i });

    expect(darListLink.className).toContain('bg-blue-50');
    expect(darListLink.className).toContain('text-blue-700');

    expect(darCreateLink.className).not.toContain('bg-blue-50');
    expect(darCreateLink.className).toContain('text-slate-600');
    expect(darCreateLink.className).toContain('bg-transparent');
  });

  it('4. When navigating to /dcc/dar/new, "ยื่นคำร้อง DAR" is properly active with active indicator', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/dar/new']}>
        <Sidebar />
      </MemoryRouter>
    );

    const darCreateLink = screen.getByRole('link', { name: /ยื่นคำร้อง DAR/i });
    const libraryLink = screen.getByRole('link', { name: /คลังเอกสารแม่บท/i });

    // "ยื่นคำร้อง DAR" is active
    expect(darCreateLink.className).toContain('bg-blue-50');
    expect(darCreateLink.className).toContain('text-blue-700');

    // Other links are inactive
    expect(libraryLink.className).not.toContain('bg-blue-50');
    expect(libraryLink.className).toContain('text-slate-600');
    expect(libraryLink.className).toContain('bg-transparent');
  });
});
