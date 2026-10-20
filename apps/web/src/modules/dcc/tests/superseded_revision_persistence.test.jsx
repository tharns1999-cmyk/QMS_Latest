import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import DocumentDetailModal from '../components/workflow/DocumentDetailModal';
import Library from '../pages/Library/Library';
import MasterList from '../pages/MasterList/MasterList';

describe('Superseded Revision History Overwrite Fix & Persistence Test Suite', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.getState().seedSupersededMockHistory();
  });

  it('1. WI-QC-01 historical revisions (Rev.00 & Rev.01) persist as SUPERSEDED and Rev.02 is EFFECTIVE', () => {
    const { documents } = useStore.getState();

    const qcDocs = documents.filter(d => {
      const code = (d.document_code || d.doc_code || d.code || d.title || '').trim().toUpperCase();
      return code === 'WI-QC-01';
    });

    expect(qcDocs.length).toBeGreaterThanOrEqual(3);

    const rev00 = qcDocs.find(d => String(d.rev || d.revision).replace(/\D/g, '') === '00');
    const rev01 = qcDocs.find(d => String(d.rev || d.revision).replace(/\D/g, '') === '01');
    const rev02 = qcDocs.find(d => String(d.rev || d.revision).replace(/\D/g, '') === '02');

    expect(rev00).toBeDefined();
    expect(rev00.status).toBe('SUPERSEDED');
    expect(rev00.darId || rev00.darRef).toBe('DAR-2026-001');

    expect(rev01).toBeDefined();
    expect(rev01.status).toBe('SUPERSEDED');
    expect(rev01.darId || rev01.darRef).toBe('DAR-2026-002');

    expect(rev02).toBeDefined();
    expect(rev02.status).toBe('EFFECTIVE');
    expect(rev02.darId || rev02.darRef).toBe('DAR-2026-003');
  });

  it('2. Binding check: each revision is strictly linked to its own DAR', () => {
    const { documents, dars } = useStore.getState();

    const rev00 = documents.find(d => 
      (d.document_code === 'WI-QC-01' || d.title === 'WI-QC-01') && 
      String(d.rev || d.revision).replace(/\D/g, '') === '00'
    );
    const rev01 = documents.find(d => 
      (d.document_code === 'WI-QC-01' || d.title === 'WI-QC-01') && 
      String(d.rev || d.revision).replace(/\D/g, '') === '01'
    );
    const rev02 = documents.find(d => 
      (d.document_code === 'WI-QC-01' || d.title === 'WI-QC-01') && 
      String(d.rev || d.revision).replace(/\D/g, '') === '02'
    );

    const dar1 = dars.find(d => d.id === 'DAR-2026-001' || d.dar_no === 'DAR-2026-001');
    const dar2 = dars.find(d => d.id === 'DAR-2026-002' || d.dar_no === 'DAR-2026-002');
    const dar3 = dars.find(d => d.id === 'DAR-2026-003' || d.dar_no === 'DAR-2026-003');

    expect(dar1).toBeDefined();
    expect(dar1.revision || dar1.target_revision).toBe('00');
    expect(rev00.darRef || rev00.darId).toBe(dar1.id);

    expect(dar2).toBeDefined();
    expect(dar2.revision || dar2.target_revision).toBe('01');
    expect(rev01.darRef || rev01.darId).toBe(dar2.id);

    expect(dar3).toBeDefined();
    expect(dar3.revision || dar3.target_revision).toBe('02');
    expect(rev02.darRef || rev02.darId).toBe(dar3.id);
  });

  it('3. promoteDarToEffective generates unique snapshot ID without overwriting historical revisions', () => {
    const store = useStore.getState();

    // Create a new DAR promoting WI-QC-01 to Rev.03
    const newDar = {
      id: 'DAR-2026-004',
      dar_no: 'DAR-2026-004',
      darNo: 'DAR-2026-004',
      document_code: 'WI-QC-01',
      doc_code: 'WI-QC-01',
      title: 'WI-QC-01',
      document_title: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า Rev.03',
      target_revision: '03',
      revision: '03',
      previous_revision: '02',
      effective_date: '2026-11-01',
      department: 'QC',
      status: 'APPROVED'
    };

    useStore.setState((state) => ({
      dars: [...state.dars, newDar]
    }));

    // Execute promotion
    store.promoteDarToEffective('DAR-2026-004');

    const updatedDocs = useStore.getState().documents.filter(d => 
      (d.document_code || d.doc_code || d.code || d.title || '').trim().toUpperCase() === 'WI-QC-01'
    );

    // Should now have 4 revisions: Rev.00 (Superseded), Rev.01 (Superseded), Rev.02 (Superseded), Rev.03 (Effective)
    expect(updatedDocs.length).toBeGreaterThanOrEqual(4);

    const supersededRevs = updatedDocs
      .filter(d => d.status === 'SUPERSEDED')
      .map(d => String(d.rev || d.revision).replace(/\D/g, ''));

    expect(supersededRevs).toContain('00');
    expect(supersededRevs).toContain('01');
    expect(supersededRevs).toContain('02');

    // Verify all IDs are completely unique
    const allIds = updatedDocs.map(d => d.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);

    // Verify the newly promoted document is EFFECTIVE Rev.03
    const effectiveDoc = updatedDocs.find(d => d.status === 'EFFECTIVE');
    expect(effectiveDoc).toBeDefined();
    expect(String(effectiveDoc.revision || effectiveDoc.rev).replace(/\D/g, '')).toBe('03');
    expect(effectiveDoc.darRef).toBe('DAR-2026-004');
  });

  it('4. Superseded revisions list can be sorted descending without collapsing into a single row', () => {
    const { documents } = useStore.getState();

    const supersededQc = documents.filter(d => {
      const code = (d.document_code || d.doc_code || d.code || d.title || '').trim().toUpperCase();
      return code === 'WI-QC-01' && d.status === 'SUPERSEDED';
    }).sort((a, b) => {
      const revA = parseInt(String(a.rev || a.revision || '0').replace(/\D/g, ''), 10) || 0;
      const revB = parseInt(String(b.rev || b.revision || '0').replace(/\D/g, ''), 10) || 0;
      return revB - revA;
    });

    expect(supersededQc.length).toBeGreaterThanOrEqual(2);
    expect(String(supersededQc[0].rev || supersededQc[0].revision).replace(/\D/g, '')).toBe('01');
    expect(String(supersededQc[1].rev || supersededQc[1].revision).replace(/\D/g, '')).toBe('00');
  });

  it('5. archivePreviousRevision archives correctly with unique snapshot and accumulates', () => {
    const store = useStore.getState();

    // Call archivePreviousRevision on an existing doc
    store.archivePreviousRevision('WI-QC-01', '02', '03', 'DAR-2026-004');

    const { documents } = useStore.getState();
    const supersededDocs = documents.filter(d => 
      (d.document_code === 'WI-QC-01' || d.title === 'WI-QC-01') && 
      d.status === 'SUPERSEDED'
    );

    // Rev.00, Rev.01, and Rev.02 should all be present in superseded
    const revs = supersededDocs.map(d => String(d.rev || d.revision).replace(/\D/g, ''));
    expect(revs).toContain('00');
    expect(revs).toContain('01');
    expect(revs).toContain('02');
  });

  it('6. DocumentDetailModal for WI-QC-01 Rev.00 displays DAR-2026-001', () => {
    const { documents } = useStore.getState();
    const doc00 = documents.find(d => 
      (d.document_code === 'WI-QC-01' || d.title === 'WI-QC-01') && 
      String(d.rev || d.revision).replace(/\D/g, '') === '00'
    );

    render(
      <MemoryRouter>
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={doc00}
        />
      </MemoryRouter>
    );

    const historyTab = screen.getByRole('button', { name: /ประวัติ DAR/i });
    fireEvent.click(historyTab);

    expect(screen.getByText(/DAR-2026-001/i)).toBeInTheDocument();
  });

  it('7. DocumentDetailModal for WI-QC-01 Rev.01 displays DAR-2026-002', () => {
    const { documents } = useStore.getState();
    const doc01 = documents.find(d => 
      (d.document_code === 'WI-QC-01' || d.title === 'WI-QC-01') && 
      String(d.rev || d.revision).replace(/\D/g, '') === '01'
    );

    render(
      <MemoryRouter>
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={doc01}
        />
      </MemoryRouter>
    );

    const historyTab = screen.getByRole('button', { name: /ประวัติ DAR/i });
    fireEvent.click(historyTab);

    expect(screen.getByText(/DAR-2026-002/i)).toBeInTheDocument();
  });

  it('8. DocumentDetailModal for WI-QC-01 Rev.02 displays DAR-2026-003', () => {
    const { documents } = useStore.getState();
    const doc02 = documents.find(d => 
      (d.document_code === 'WI-QC-01' || d.title === 'WI-QC-01') && 
      String(d.rev || d.revision).replace(/\D/g, '') === '02'
    );

    render(
      <MemoryRouter>
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={doc02}
        />
      </MemoryRouter>
    );

    const historyTab = screen.getByRole('button', { name: /ประวัติ DAR/i });
    fireEvent.click(historyTab);

    expect(screen.getByText(/DAR-2026-003/i)).toBeInTheDocument();
  });

  it('9. Library Superseded tab groups WI-QC-01 into exactly 1 row and footer displays 1 รายการ / 1 รายการ', () => {
    useStore.setState({
      currentUser: {
        id: 'U-QC-001',
        name: 'QC Leader',
        department: 'QC',
        depts: ['QC'],
        role: 'DEPT_ADMIN',
        level: 4,
        isDcc: false
      }
    });

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Switch to Dept tab then Superseded tab
    fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));
    const supersededTabBtn = screen.getByRole('button', { name: /ฉบับเดิมตกรุ่น/i });
    fireEvent.click(supersededTabBtn);

    // Search for WI-QC-01
    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/i), { target: { value: 'WI-QC-01' } });

    // Document code WI-QC-01 must be present
    const docCodeElements = screen.getAllByText('WI-QC-01');
    expect(docCodeElements.length).toBe(1);

    // Footer counter must strictly display 1 รายการ / 1 รายการ
    expect(screen.getByText(/แสดงผล/i)).toHaveTextContent('แสดงผล 1 รายการ / 1 รายการ');
  });

  it('10. Superseded row displays Revision Stack Chips (Rev.01 ล่าสุด, Rev.00) and aggregated recall status', () => {
    useStore.setState({
      currentUser: {
        id: 'U-QC-001',
        name: 'QC Leader',
        department: 'QC',
        depts: ['QC'],
        role: 'DEPT_ADMIN',
        level: 4,
        isDcc: false
      }
    });

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));
    fireEvent.click(screen.getByRole('button', { name: /ฉบับเดิมตกรุ่น/i }));

    // Find the row containing WI-QC-01
    const row = screen.getByText('WI-QC-01').closest('tr');
    expect(row).toBeInTheDocument();

    const rowQueries = within(row);

    // Check clean summary: Rev.00 – Rev.01 without (ล่าสุด) chip
    expect(rowQueries.getByText(/Rev\.00 – Rev\.01/i)).toBeInTheDocument();
    expect(rowQueries.queryByText(/\(ล่าสุด\)/i)).not.toBeInTheDocument();

    // Check recall status & superseded lifecycle count
    expect(rowQueries.getByText(/เรียกคืนครบแล้ว|ไม่มีสำเนาค้างเรียกคืน|รอเรียกคืน/i)).toBeInTheDocument();
    expect(rowQueries.getByText(/ฉบับตกรุ่น \(2 ฉบับ\)/i)).toBeInTheDocument();
  });

  it('11. DocumentDetailModal unified vertical accordion timeline renders all historical superseded DARs with clean header and expand/collapse controls', () => {
    const { documents } = useStore.getState();
    const supersededDocs = documents.filter(d => 
      (d.document_code === 'WI-QC-01' || d.title === 'WI-QC-01') && 
      d.status === 'SUPERSEDED'
    ).sort((a, b) => parseInt(String(b.rev || b.revision), 10) - parseInt(String(a.rev || a.revision), 10));

    // Open modal with latest superseded revision
    render(
      <MemoryRouter>
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={supersededDocs[0]}
        />
      </MemoryRouter>
    );

    // Criteria 1: Header switcher pills must be completely removed
    const switcherButtons = screen.queryAllByRole('button', { name: /สลับดูข้อมูล Rev\./i });
    expect(switcherButtons.length).toBe(0);

    // Header displays clean badges: code and superseded status
    expect(screen.getAllByText('WI-QC-01').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/ฉบับเดิม \(Superseded\)/i)).toBeInTheDocument();

    // Criteria 2: History tab button shows exact count of superseded revisions (2)
    const historyTab = screen.getByRole('button', { name: /ประวัติ DAR และการแก้ไข/i });
    expect(historyTab).toHaveTextContent(/ประวัติ DAR และการแก้ไข \(2\)/i);
    fireEvent.click(historyTab);

    // Counter shows 2 items found
    expect(screen.getByText(/พบทั้งหมด 2 ฉบับ/i)).toBeInTheDocument();

    // Both DAR-2026-002 (Rev.01) and DAR-2026-001 (Rev.00) are rendered in the unified timeline
    expect(screen.getByText(/DAR-2026-002/i)).toBeInTheDocument();
    expect(screen.getByText(/DAR-2026-001/i)).toBeInTheDocument();

    // Criteria 3: Accordion state:
    // First/Latest item (DAR-2026-002) is expanded by default (its reason is visible)
    expect(screen.getByText(/ปรับปรุงเกณฑ์การชักตัวอย่าง/i)).toBeInTheDocument();

    // The "ขยายทั้งหมด / พับเก็บทั้งหมด" button is present and functional
    const toggleAllBtn = screen.getByRole('button', { name: /ขยายทั้งหมด|พับเก็บทั้งหมด/i });
    expect(toggleAllBtn).toBeInTheDocument();

    // Click "ขยายทั้งหมด" to expand all
    fireEvent.click(toggleAllBtn);
    expect(screen.getByText(/จัดทำคู่มือปฏิบัติงานการตรวจสอบคุณภาพ/i)).toBeInTheDocument();
    expect(toggleAllBtn).toHaveTextContent(/พับเก็บทั้งหมด/i);

    // Click "พับเก็บทั้งหมด" to collapse all
    fireEvent.click(toggleAllBtn);
    expect(toggleAllBtn).toHaveTextContent(/ขยายทั้งหมด/i);
  });

  it('12. Clean Text Summary: Superseded tab in Library and MasterList displays minimal text summary without cluttered chips and excludes current effective rev', () => {
    // Set test user as QA Admin
    useStore.setState({
      currentUser: {
        id: 'U001',
        name: 'QA Admin',
        department: 'QC',
        depts: ['QC', 'QA'],
        isDcc: true,
        role: 'DCC_ADMIN',
        level: 5
      }
    });

    const { unmount } = render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Switch to "ในแผนกฉัน" then "ฉบับเดิมตกรุ่น (Superseded)" tab
    fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));
    const supersededTabBtn = screen.getByRole('button', { name: /ฉบับเดิมตกรุ่น|ฉบับตกรุ่น/i });
    fireEvent.click(supersededTabBtn);

    // Verify WI-QC-01 row displays Rev.00 - Rev.01 (2 ฉบับเดิม), strictly omitting Rev.02 (EFFECTIVE)
    expect(screen.getByText(/Rev\.00 – Rev\.01/i)).toBeInTheDocument();
    expect(screen.getByText(/\(2 ฉบับเดิม\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ตกรุ่นเมื่อ:/i).length).toBeGreaterThanOrEqual(1);

    // Verify no cluttered revision chips or (ล่าสุด) or +X ฉบับเดิม
    expect(screen.queryByText(/Rev\.02 \(ล่าสุด\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+1 ฉบับเดิม/i)).not.toBeInTheDocument();

    unmount();

    // Now verify MasterList
    render(
      <MemoryRouter>
        <MasterList />
      </MemoryRouter>
    );

    // Switch MasterList to SUPERSEDED tab
    const supersededBtn = screen.getByRole('button', { name: /ฉบับตกรุ่น \(SUPERSEDED\)/i });
    fireEvent.click(supersededBtn);

    // Verify WI-QC-01 displays clean text summary
    expect(screen.getByText(/Rev\.00 – Rev\.01/i)).toBeInTheDocument();
    expect(screen.getByText(/\(2 ฉบับเดิม\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ตกรุ่นเมื่อ:/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Rev\.02 \(ล่าสุด\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+1 ฉบับเดิม/i)).not.toBeInTheDocument();
  });
});
