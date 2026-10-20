import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Library from '../pages/Library/Library';
import useStore from '../store/useStore';

vi.mock('../services/UniversalWatermarkService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    UniversalWatermarkService: {
      ...actual.UniversalWatermarkService,
      generateStampingPDF: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      downloadWatermarkedPdf: vi.fn().mockResolvedValue('blob:mock-url')
    }
  };
});

describe('Library Figma UI3 Action Dock & Overflow Menu Tests', () => {
  const dccUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    department: 'DC',
    role: 'DCC_ADMIN',
    level: 1,
    isDcc: true
  };

  const sampleDoc = {
    id: 'doc-001',
    title: 'SOP-QA-01',
    name: 'คู่มือการควบคุมคุณภาพ',
    department: 'QA',
    rev: '01',
    effectiveDate: '2026-08-20',
    status: 'EFFECTIVE',
    access_control: { scope: 'GENERAL' },
    distributions: [{ departmentId: 'QA' }]
  };

  const activeCopy = {
    id: 'cc-01',
    docId: 'doc-001',
    docTitle: 'SOP-QA-01',
    holder_dept: 'QA',
    department: 'QA',
    status: 'ISSUED_ACTIVE'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: dccUser,
      documents: [sampleDoc],
      controlledCopyInstances: [activeCopy],
      documentControlledCopies: [activeCopy],
      masterDepartments: [{ id: 'QA', nameTh: 'ฝ่ายประกันคุณภาพ' }],
      documentTypes: [{ id: 'SOP', code: 'SOP', nameTh: 'ขั้นตอนการปฏิบัติงาน' }]
    });
  });

  it('1. Renders compact 2+1 Action Dock with Eye, Download and MoreHorizontal', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );
    // QA GENERAL doc for a DC user lives in the General tab (default tab is My Dept)
    fireEvent.click(screen.getByRole('button', { name: /เอกสารทั่วไป/ }));

    // Quick Action 1: Eye
    const eyeBtn = screen.getByTitle('ดูรายละเอียดเอกสาร');
    expect(eyeBtn).toBeInTheDocument();

    // Quick Action 2: Download
    const downloadBtn = screen.getByTitle('ดาวน์โหลด Master Document (DCC)');
    expect(downloadBtn).toBeInTheDocument();

    // Quick Action 3: Overflow Menu Button
    const moreBtn = screen.getByTitle('เมนูการจัดการเพิ่มเติม');
    expect(moreBtn).toBeInTheDocument();
  });

  it('2. Clicking MoreHorizontal toggles the Overflow Menu with semantic Thai labels', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );
    // QA GENERAL doc for a DC user lives in the General tab (default tab is My Dept)
    fireEvent.click(screen.getByRole('button', { name: /เอกสารทั่วไป/ }));

    const moreBtn = screen.getByTitle('เมนูการจัดการเพิ่มเติม');
    fireEvent.click(moreBtn);

    // Context menu items
    expect(screen.queryByText('เปิดดูในแท็บใหม่ (Full Viewer)')).not.toBeInTheDocument();
    expect(screen.getByText('ดาวน์โหลด External Release')).toBeInTheDocument();
    expect(screen.queryByText('Watermark Studio (ทดสอบลายน้ำ)')).not.toBeInTheDocument();
    expect(screen.getByText('ขอสำเนาควบคุมเพิ่มเติม')).toBeInTheDocument();
    expect(screen.getByText('ยื่นคำร้องขอแก้ไขฉบับใหม่')).toBeInTheDocument();
    expect(screen.getByText('แจ้งชำรุด หรือสูญหาย')).toBeInTheDocument();
  });

  it('3. Pressing Escape closes the open overflow menu', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );
    // QA GENERAL doc for a DC user lives in the General tab (default tab is My Dept)
    fireEvent.click(screen.getByRole('button', { name: /เอกสารทั่วไป/ }));

    const moreBtn = screen.getByTitle('เมนูการจัดการเพิ่มเติม');
    fireEvent.click(moreBtn);

    const menuPanel = document.querySelector('.overflow-dropdown-menu');
    expect(menuPanel).not.toHaveClass('hidden');

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(menuPanel).toHaveClass('hidden');
  });

  it('4. Watermark Studio is completely purged from overflow menu and modal is not rendered', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );
    // QA GENERAL doc for a DC user lives in the General tab (default tab is My Dept)
    fireEvent.click(screen.getByRole('button', { name: /เอกสารทั่วไป/ }));

    const moreBtn = screen.getByTitle('เมนูการจัดการเพิ่มเติม');
    fireEvent.click(moreBtn);

    expect(screen.queryByTitle('Watermark Studio (ทดสอบและดาวน์โหลดลายน้ำ 7 รูปแบบ)')).not.toBeInTheDocument();
    expect(screen.queryByText('Watermark Studio (ทดสอบลายน้ำ)')).not.toBeInTheDocument();
    expect(screen.queryByText(/Watermark Studio & PDF Downloader/i)).not.toBeInTheDocument();
  });
});
