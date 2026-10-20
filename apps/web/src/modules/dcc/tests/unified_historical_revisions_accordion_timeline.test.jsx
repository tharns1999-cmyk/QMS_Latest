import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import DocumentDetailModal from '../components/workflow/DocumentDetailModal';

describe('Unified Historical Revisions Vertical Accordion Timeline Test Suite', () => {
  const currentUser = {
    id: 'U-QC-001',
    name: 'QC Head',
    department: 'QC',
    depts: ['QC'],
    role: 'DEPT_ADMIN',
    level: 4,
    isDcc: false
  };

  beforeEach(() => {
    useStore.getState().resetStore();
  });

  it('1. Header has NO revision switcher pills and cleanly displays Document Code, Status Badge, and Title', () => {
    const docCode = 'WI-ENG-05';
    const supersededDoc = {
      id: 'doc-wi-eng-05-r03',
      document_code: docCode,
      code: docCode,
      title: docCode,
      name: 'ขั้นตอนการซ่อมบำรุงเชิงป้องกันเครื่องจักร',
      status: 'SUPERSEDED',
      rev: '03',
      revision: '03',
      department: 'ENG'
    };

    const effectiveDoc = {
      id: 'doc-wi-eng-05-r04',
      document_code: docCode,
      code: docCode,
      title: docCode,
      name: 'ขั้นตอนการซ่อมบำรุงเชิงป้องกันเครื่องจักร',
      status: 'EFFECTIVE',
      rev: '04',
      revision: '04',
      department: 'ENG'
    };

    const dars = [
      { id: 'DAR-ENG-001', dar_no: 'DAR-ENG-001', doc_code: docCode, target_revision: '00', status: 'COMPLETED', reason: 'Genesis Rev.00' },
      { id: 'DAR-ENG-002', dar_no: 'DAR-ENG-002', doc_code: docCode, target_revision: '01', status: 'COMPLETED', reason: 'Update lubrication standards Rev.01' },
      { id: 'DAR-ENG-003', dar_no: 'DAR-ENG-003', doc_code: docCode, target_revision: '02', status: 'COMPLETED', reason: 'Electrical safety overhaul Rev.02' },
      { id: 'DAR-ENG-004', dar_no: 'DAR-ENG-004', doc_code: docCode, target_revision: '03', status: 'COMPLETED', reason: 'Hydraulic checklist update Rev.03' },
      { id: 'DAR-ENG-005', dar_no: 'DAR-ENG-005', doc_code: docCode, target_revision: '04', status: 'EFFECTIVE', reason: 'Smart sensor integration Rev.04' }
    ];

    useStore.setState({
      currentUser,
      documents: [effectiveDoc, supersededDoc],
      dars
    });

    render(
      <MemoryRouter>
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={supersededDoc}
        />
      </MemoryRouter>
    );

    // 1. Header switcher pills are completely absent
    const pillButtons = screen.queryAllByRole('button', { name: /สลับดูข้อมูล Rev\./i });
    expect(pillButtons.length).toBe(0);

    // 2. Header displays code and status
    expect(screen.getAllByText(docCode).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/ฉบับเดิม \(Superseded\)/i)).toBeInTheDocument();
    expect(screen.getByText('ขั้นตอนการซ่อมบำรุงเชิงป้องกันเครื่องจักร')).toBeInTheDocument();
  });

  it('2. Unifies all superseded revisions into Vertical Accordion Timeline in descending order', () => {
    const docCode = 'WI-ENG-05';
    const supersededDoc = {
      id: 'doc-wi-eng-05-r03',
      document_code: docCode,
      code: docCode,
      title: docCode,
      name: 'ขั้นตอนการซ่อมบำรุงเชิงป้องกันเครื่องจักร',
      status: 'SUPERSEDED',
      rev: '03',
      revision: '03',
      department: 'ENG'
    };

    const effectiveDoc = {
      id: 'doc-wi-eng-05-r04',
      document_code: docCode,
      code: docCode,
      title: docCode,
      name: 'ขั้นตอนการซ่อมบำรุงเชิงป้องกันเครื่องจักร',
      status: 'EFFECTIVE',
      rev: '04',
      revision: '04',
      department: 'ENG'
    };

    const dars = [
      { id: 'DAR-ENG-001', dar_no: 'DAR-ENG-001', doc_code: docCode, target_revision: '00', status: 'COMPLETED', reason: 'Genesis Rev.00' },
      { id: 'DAR-ENG-002', dar_no: 'DAR-ENG-002', doc_code: docCode, target_revision: '01', status: 'COMPLETED', reason: 'Update lubrication standards Rev.01' },
      { id: 'DAR-ENG-003', dar_no: 'DAR-ENG-003', doc_code: docCode, target_revision: '02', status: 'COMPLETED', reason: 'Electrical safety overhaul Rev.02' },
      { id: 'DAR-ENG-004', dar_no: 'DAR-ENG-004', doc_code: docCode, target_revision: '03', status: 'COMPLETED', reason: 'Hydraulic checklist update Rev.03' },
      { id: 'DAR-ENG-005', dar_no: 'DAR-ENG-005', doc_code: docCode, target_revision: '04', status: 'EFFECTIVE', reason: 'Smart sensor integration Rev.04' }
    ];

    useStore.setState({
      currentUser,
      documents: [effectiveDoc, supersededDoc],
      dars
    });

    render(
      <MemoryRouter>
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={supersededDoc}
        />
      </MemoryRouter>
    );

    // Tab shows total count of 4 superseded revisions (Rev.03, Rev.02, Rev.01, Rev.00)
    const historyTab = screen.getByRole('button', { name: /ประวัติ DAR และการแก้ไข/i });
    expect(historyTab).toHaveTextContent(/ประวัติ DAR และการแก้ไข \(4\)/i);

    fireEvent.click(historyTab);

    // Action bar displays count
    expect(screen.getByText(/พบทั้งหมด 4 ฉบับ/i)).toBeInTheDocument();

    // All 4 superseded DARs are present
    expect(screen.getByText('DAR-ENG-004')).toBeInTheDocument();
    expect(screen.getByText('DAR-ENG-003')).toBeInTheDocument();
    expect(screen.getByText('DAR-ENG-002')).toBeInTheDocument();
    expect(screen.getByText('DAR-ENG-001')).toBeInTheDocument();

    // Effective Rev.04 DAR is strictly excluded
    expect(screen.queryByText('DAR-ENG-005')).not.toBeInTheDocument();

    // Default expanded state: latest revision (DAR-ENG-004) is open by default
    expect(screen.getByText('Hydraulic checklist update Rev.03')).toBeInTheDocument();

    // Older revision (DAR-ENG-001) is initially collapsed
    expect(screen.queryByText('Genesis Rev.00')).not.toBeInTheDocument();

    // Clicking older revision card expands it
    const dar001Card = screen.getByText('DAR-ENG-001').closest('button');
    expect(dar001Card).toBeInTheDocument();
    fireEvent.click(dar001Card);
    expect(screen.getByText('Genesis Rev.00')).toBeInTheDocument();
  });

  it('3. Expand All / Collapse All controls toggle all accordion items simultaneously', () => {
    const docCode = 'WI-ENG-05';
    const supersededDoc = {
      id: 'doc-wi-eng-05-r03',
      document_code: docCode,
      code: docCode,
      title: docCode,
      name: 'ขั้นตอนการซ่อมบำรุงเชิงป้องกันเครื่องจักร',
      status: 'SUPERSEDED',
      rev: '03',
      revision: '03',
      department: 'ENG'
    };

    const effectiveDoc = {
      id: 'doc-wi-eng-05-r04',
      document_code: docCode,
      code: docCode,
      title: docCode,
      name: 'ขั้นตอนการซ่อมบำรุงเชิงป้องกันเครื่องจักร',
      status: 'EFFECTIVE',
      rev: '04',
      revision: '04',
      department: 'ENG'
    };

    const dars = [
      { id: 'DAR-ENG-001', dar_no: 'DAR-ENG-001', doc_code: docCode, target_revision: '00', status: 'COMPLETED', reason: 'Genesis Rev.00' },
      { id: 'DAR-ENG-002', dar_no: 'DAR-ENG-002', doc_code: docCode, target_revision: '01', status: 'COMPLETED', reason: 'Lubrication Rev.01' },
      { id: 'DAR-ENG-003', dar_no: 'DAR-ENG-003', doc_code: docCode, target_revision: '02', status: 'COMPLETED', reason: 'Electrical Rev.02' }
    ];

    useStore.setState({
      currentUser,
      documents: [effectiveDoc, supersededDoc],
      dars
    });

    render(
      <MemoryRouter>
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={supersededDoc}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /ประวัติ DAR และการแก้ไข/i }));

    const toggleAllBtn = screen.getByRole('button', { name: /ขยายทั้งหมด|พับเก็บทั้งหมด/i });
    expect(toggleAllBtn).toBeInTheDocument();

    // Click Expand All
    fireEvent.click(toggleAllBtn);
    expect(screen.getByText('Genesis Rev.00')).toBeInTheDocument();
    expect(screen.getByText('Lubrication Rev.01')).toBeInTheDocument();
    expect(screen.getByText('Electrical Rev.02')).toBeInTheDocument();
    expect(toggleAllBtn).toHaveTextContent(/พับเก็บทั้งหมด/i);

    // Click Collapse All
    fireEvent.click(toggleAllBtn);
    expect(screen.queryByText('Genesis Rev.00')).not.toBeInTheDocument();
    expect(screen.queryByText('Lubrication Rev.01')).not.toBeInTheDocument();
    expect(screen.queryByText('Electrical Rev.02')).not.toBeInTheDocument();
    expect(toggleAllBtn).toHaveTextContent(/ขยายทั้งหมด/i);
  });

  it('4. Seamlessly handles large revision history (25+ Revisions) without layout failure', () => {
    const docCode = 'SOP-MFG-99';
    const totalRevs = 25;
    const dars = [];

    for (let i = 0; i <= totalRevs; i++) {
      const revStr = String(i).padStart(2, '0');
      dars.push({
        id: `DAR-MFG-${revStr}`,
        dar_no: `DAR-MFG-${revStr}`,
        doc_code: docCode,
        target_revision: revStr,
        status: i === totalRevs ? 'EFFECTIVE' : 'COMPLETED',
        reason: `Detailed modification description for revision ${revStr}`
      });
    }

    const supersededDoc = {
      id: 'doc-mfg-99-superseded',
      document_code: docCode,
      code: docCode,
      title: docCode,
      name: 'ระเบียบการควบคุมกระบวนการผลิตความหนาแน่นสูง 25 Revisions',
      status: 'SUPERSEDED',
      rev: '24',
      revision: '24',
      department: 'MFG'
    };

    const effectiveDoc = {
      id: 'doc-mfg-99-effective',
      document_code: docCode,
      code: docCode,
      title: docCode,
      name: 'ระเบียบการควบคุมกระบวนการผลิตความหนาแน่นสูง 25 Revisions',
      status: 'EFFECTIVE',
      rev: '25',
      revision: '25',
      department: 'MFG'
    };

    useStore.setState({
      currentUser,
      documents: [effectiveDoc, supersededDoc],
      dars
    });

    render(
      <MemoryRouter>
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={supersededDoc}
        />
      </MemoryRouter>
    );

    // Tab shows exactly 25 superseded revisions
    const historyTab = screen.getByRole('button', { name: /ประวัติ DAR และการแก้ไข/i });
    expect(historyTab).toHaveTextContent(/ประวัติ DAR และการแก้ไข \(25\)/i);

    fireEvent.click(historyTab);

    // Action bar confirms 25 revisions found
    expect(screen.getByText(/พบทั้งหมด 25 ฉบับ/i)).toBeInTheDocument();

    // Verify latest superseded revision (Rev.24) and oldest (Rev.00) are both in the DOM
    expect(screen.getByText('DAR-MFG-24')).toBeInTheDocument();
    expect(screen.getByText('DAR-MFG-00')).toBeInTheDocument();

    // First item is expanded by default
    expect(screen.getByText('Detailed modification description for revision 24')).toBeInTheDocument();

    // Expand all 25 items
    const toggleAllBtn = screen.getByRole('button', { name: /ขยายทั้งหมด/i });
    fireEvent.click(toggleAllBtn);

    // Oldest item reason is now visible
    expect(screen.getByText('Detailed modification description for revision 00')).toBeInTheDocument();
  });
});
