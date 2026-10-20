import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../layout/Sidebar';
import useStore from '../../store/useStore';

describe('Hub & Spoke Navigation Isolation (Context-Aware Sidebar)', () => {
  beforeEach(() => {
    // Reset to DCC Admin user for full menu privileges
    useStore.getState().setCurrentUser('EMP-001');
  });

  it('1. When on Portal Landing Page (/portal), hides DCC menus and shows only Global Workspace & Dev Tools', () => {
    render(
      <MemoryRouter initialEntries={['/portal']}>
        <Sidebar />
      </MemoryRouter>
    );

    // Global / Workspace visible
    expect(screen.getByText('ภาพรวมพอร์ทัล')).toBeInTheDocument();

    // Dev Tools & User switcher visible
    expect(screen.getByText('DEV TOOLS')).toBeInTheDocument();
    expect(screen.getByTitle('สลับผู้ใช้งาน / บทบาทจำลอง')).toBeInTheDocument();

    // DCC Menus MUST NOT be present (Sidebar Context Bleed Prevention)
    expect(screen.queryByText('คลังเอกสารแม่บท')).not.toBeInTheDocument();
    expect(screen.queryByText('ยื่นคำร้อง DAR')).not.toBeInTheDocument();
    expect(screen.queryByText('ติดตามคำร้องของฉัน')).not.toBeInTheDocument();
    expect(screen.queryByText('คลังเอกสารภายนอก')).not.toBeInTheDocument();
    expect(screen.queryByText('การทบทวนตามรอบ')).not.toBeInTheDocument();
    expect(screen.queryByText('ทะเบียนสำเนาควบคุม')).not.toBeInTheDocument();
    expect(screen.queryByText('จัดการข้อมูลหลัก')).not.toBeInTheDocument();
    expect(screen.queryByText('บันทึกประวัติการทำงาน')).not.toBeInTheDocument();
    expect(screen.queryByText('กลับสู่พอร์ทัลหลัก')).not.toBeInTheDocument();
  });

  it('2. When in DCC module route (/dcc/dashboard), renders DCC menus and Quick Return link', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    // In DCC Module: 'กลับสู่พอร์ทัลหลัก' replaces 'ภาพรวมพอร์ทัล' to avoid duplicate home links
    expect(screen.queryByText('ภาพรวมพอร์ทัล')).not.toBeInTheDocument();
    expect(screen.getByText('กลับสู่พอร์ทัลหลัก')).toBeInTheDocument();

    // DCC Menus rendered in Spoke
    expect(screen.getByText('คลังเอกสารแม่บท')).toBeInTheDocument();
    expect(screen.getByText('ยื่นคำร้อง DAR')).toBeInTheDocument();
    expect(screen.getByText('ติดตามคำร้องของฉัน')).toBeInTheDocument();
    expect(screen.getByText('คลังเอกสารภายนอก')).toBeInTheDocument();
    expect(screen.getByText('การทบทวนตามรอบ')).toBeInTheDocument();
    expect(screen.getByText('ทะเบียนสำเนาควบคุม')).toBeInTheDocument();
    expect(screen.getByText('จัดการข้อมูลหลัก')).toBeInTheDocument();
    expect(screen.getByText('บันทึกประวัติการทำงาน')).toBeInTheDocument();

    // Bottom tools always available
    expect(screen.getByText('DEV TOOLS')).toBeInTheDocument();
  });

  it('3. When navigating to deep DCC route like /dcc/library, DCC navigation remains active', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/library']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText('คลังเอกสารแม่บท')).toBeInTheDocument();
    expect(screen.getByText('กลับสู่พอร์ทัลหลัก')).toBeInTheDocument();
  });
});
