import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DarNewForm from '../pages/DarWorkflow/DarNewForm';
import useStore from '../../../store/useStore';

describe('Urgent Fix: White Screen of Death (WSOD) Prevention at Route /dcc/dar/new/document', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'EMP-001',
        empId: 'EMP-001',
        name: 'ธนาวุฒิ สมควรกิจดำรง',
        department: 'DC',
        role: 'DCC_ADMIN',
        level: 5
      },
      masterUsers: [
        { id: 'EMP-001', empId: 'EMP-001', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'DC', level: 5 },
        { id: 'EMP-002', empId: 'EMP-002', name: 'ศิริพร วงศ์สุวรรณ', department: 'QA', level: 4 }
      ],
      documentTypes: [
        { code: 'SOP', nameTh: 'ขั้นตอนการปฏิบัติงานมาตรฐาน', status: 'ACTIVE', allowDar: true },
        { code: 'WI', nameTh: 'วิธีการทำงาน', status: 'ACTIVE', allowDar: true },
        { code: 'FM', nameTh: 'แบบฟอร์ม', status: 'ACTIVE', allowDar: true, is_form_type: true }
      ],
      masterDepartments: [
        { id: 'DC', nameTh: 'ศูนย์ควบคุมเอกสาร', status: 'ACTIVE' },
        { id: 'QA', nameTh: 'ฝ่ายประกันคุณภาพ', status: 'ACTIVE' },
        { id: 'PD', nameTh: 'ฝ่ายผลิต', status: 'ACTIVE' }
      ],
      reviewUsers: [
        { id: 'EMP-002', empId: 'EMP-002', name: 'ศิริพร วงศ์สุวรรณ', department: 'QA', level: 4 }
      ],
      approveUsers: [],
      distributions: []
    });
  });

  it('renders DarNewForm at route /dcc/dar/new/document without crashing', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/dar/new/document']}>
        <Routes>
          <Route path="/dcc/dar/new/document" element={<DarNewForm />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('ยื่นคำร้องสร้างเอกสารใหม่ (New Document DAR)')).toBeInTheDocument();
    expect(screen.getByText(/ระดับการเข้าถึงและความลับของเอกสาร/i)).toBeInTheDocument();
  });

  it('seamlessly switches to RESTRICTED mode and renders 2-column split view without WSOD', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/dar/new/document']}>
        <Routes>
          <Route path="/dcc/dar/new/document" element={<DarNewForm />} />
        </Routes>
      </MemoryRouter>
    );

    const restrictedCard = screen.getByRole('button', { name: /ลับเฉพาะบุคคล\/ตำแหน่ง \(Restricted\)/i });
    fireEvent.click(restrictedCard);

    // Default mode: Minimum Position Level; switching to named individuals shows the Whitelist Picker
    expect(screen.getByText(/ระดับตำแหน่งขั้นต่ำที่อนุญาต/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ระบุรายชื่อเฉพาะบุคคล' }));
    expect(screen.getByText(/ระบุบุคคลที่ได้รับอนุญาตเพิ่มเติมเฉพาะบุคคล/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ค้นหาด้วยชื่อ/i)).toBeInTheDocument();
  });

  it('handles empty / undefined arrays defensively without throwing errors', () => {
    // Clear out arrays to test defensive fallbacks
    useStore.setState({
      currentUser: { id: 'U-BARE', name: 'Bare User' }, // no department
      masterUsers: null,
      reviewUsers: undefined,
      approveUsers: null,
      masterDepartments: undefined,
      documentTypes: null,
      distributions: null
    });

    render(
      <MemoryRouter initialEntries={['/dcc/dar/new/document']}>
        <Routes>
          <Route path="/dcc/dar/new/document" element={<DarNewForm />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('ยื่นคำร้องสร้างเอกสารใหม่ (New Document DAR)')).toBeInTheDocument();

    // Click Restricted
    const restrictedCard = screen.getByRole('button', { name: /ลับเฉพาะบุคคล\/ตำแหน่ง \(Restricted\)/i });
    fireEvent.click(restrictedCard);

    expect(screen.getByText(/ระดับตำแหน่งขั้นต่ำที่อนุญาต/i)).toBeInTheDocument();
  });
});
