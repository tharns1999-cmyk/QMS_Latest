import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DccRecallActionModal from '../components/modals/DccRecallActionModal';
import useStore from '../../../store/useStore';

describe('DccRecallActionModal High-Efficiency Two-Column Layout Verification', () => {
  const mockGroup = {
    docId: 'DOC-PD-001',
    docCode: 'SOP-PD-01',
    docTitle: 'คู่มือการผลิตและการควบคุมกระบวนการ',
    docVersion: '00',
    taskId: 'TASK-RECALL-001',
    copies: [
      { id: 'cp-01', copy_no: '01', ccNumber: 'CC-01', holder_dept: 'PD', department: 'PD', location: 'สายการผลิต 1' },
      { id: 'cp-02', copy_no: '02', ccNumber: 'CC-02', holder_dept: 'QC', department: 'QC', location: 'ห้องปฏิบัติการ QC' }
    ]
  };

  const mockClose = vi.fn();
  const mockComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Header: renders compact title, monospace badges, and eliminates yellow warning banner', () => {
    render(
      <DccRecallActionModal
        isOpen={true}
        onClose={mockClose}
        group={mockGroup}
        onComplete={mockComplete}
      />
    );

    // Compact title
    expect(screen.getByText(/บันทึกการเรียกคืนและทำลายสำเนา \(Recall & Disposition\)/i)).toBeInTheDocument();

    // Monospace doc code and revision badges
    expect(screen.getByText(/\[ SOP-PD-01 \]/i)).toBeInTheDocument();
    expect(screen.getByText(/Rev\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/คู่มือการผลิตและการควบคุมกระบวนการ/i)).toBeInTheDocument();

    // Yellow banner must be permanently removed
    expect(screen.queryByText(/ประจำจุดใน/i)).not.toBeInTheDocument();
  });

  it('2. Left Column: renders Step 1 with copy cards, eliminates "ได้รับเล่มแล้ว" badge, and shows progress bar', () => {
    render(
      <DccRecallActionModal
        isOpen={true}
        onClose={mockClose}
        group={mockGroup}
        onComplete={mockComplete}
      />
    );

    // Step 1 Header
    expect(screen.getByText(/1\. ตรวจรับเล่มสำเนาจริง/i)).toBeInTheDocument();

    // Copy cards
    expect(screen.getByText(/Copy 01/i)).toBeInTheDocument();
    expect(screen.getByText(/Copy 02/i)).toBeInTheDocument();
    expect(screen.getByText(/สายการผลิต 1/i)).toBeInTheDocument();
    expect(screen.getByText(/ห้องปฏิบัติการ QC/i)).toBeInTheDocument();

    // Old "ได้รับเล่มแล้ว" and "รอเก็บเล่ม" badges must NOT be rendered
    expect(screen.queryByText('ได้รับเล่มแล้ว')).not.toBeInTheDocument();
    expect(screen.queryByText('รอเก็บเล่ม')).not.toBeInTheDocument();

    // Progress bar
    expect(screen.getByText(/ความคืบหน้าการตรวจรับ/i)).toBeInTheDocument();
  });

  it('3. Right Column: renders Step 2 (radio cards) and Step 3 (audit evidence fields)', () => {
    render(
      <DccRecallActionModal
        isOpen={true}
        onClose={mockClose}
        group={mockGroup}
        onComplete={mockComplete}
      />
    );

    // Step 2
    expect(screen.getByText(/2\. วิธีการจัดการทางกายภาพ \(Disposition Method\)/i)).toBeInTheDocument();
    expect(screen.getByText(/ทำลายทิ้ง \(Shred \/ Destroy\)/i)).toBeInTheDocument();
    expect(screen.getByText(/ประทับตรา OBSOLETE & เข้าคลัง/i)).toBeInTheDocument();

    // Step 3
    expect(screen.getByText(/3\. บันทึกหลักฐาน \(Audit Evidence\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/REF-DISP-2026-001/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/คุณบีม \(QC\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ระบุข้อความบันทึกเพิ่มเติมสำหรับการตรวจประเมิน/i)).toBeInTheDocument();
  });

  it('4. Footer & Validation: disables submit when disposition method missing and enables when ready', () => {
    render(
      <DccRecallActionModal
        isOpen={true}
        onClose={mockClose}
        group={mockGroup}
        onComplete={mockComplete}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /บันทึกการจัดการสำเนาและลงทะเบียน/i });

    // Initial state (both preselected, but no disposition method yet)
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/ยังไม่เลือกวิธีทำลาย/i)).toBeInTheDocument();

    // Select disposition method
    const shredOption = screen.getByRole('radio', { name: /ทำลายทิ้ง \(Shred \/ Destroy\)/i });
    fireEvent.click(shredOption);

    // Now ready
    expect(screen.getByText(/✓ พร้อมลงทะเบียน \(2 ชุด\)/i)).toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();

    // Submit triggers complete callback and close
    fireEvent.click(submitBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        collectedCopyIds: ['cp-01', 'cp-02'],
        dispositionMethod: 'DESTROY_SCRAP'
      })
    );
  });

  it('5. Lost & Voided: renders option 3, updates placeholders, auto-fills notes, and displays bypass badge', () => {
    render(
      <DccRecallActionModal
        isOpen={true}
        onClose={mockClose}
        group={mockGroup}
        onComplete={mockComplete}
      />
    );

    // Option 3
    const lostVoidRadio = screen.getByRole('radio', { name: /บันทึกสูญหาย \(Lost\/Void\)/i });
    expect(lostVoidRadio).toBeInTheDocument();
    expect(screen.getByText(/ตัดจำหน่ายเล่มสูญหาย ประกาศยกเลิกสิทธิ์เล่มเดิม/i)).toBeInTheDocument();

    // Select Lost & Voided
    fireEvent.click(lostVoidRadio);

    // Step 1 bypass badge must be visible
    expect(screen.getByText(/ยืนยันจำหน่ายโดยไม่มีเล่มจริง \(No Physical Copy Returned\)/i)).toBeInTheDocument();

    // Tailored placeholders
    expect(screen.getByPlaceholderText(/เช่น DAR-2026-045, MEMO-LOST-001/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ผู้รับรองเหตุสูญหาย \/ หัวหน้างานแผนกผู้ถือครอง/i)).toBeInTheDocument();

    // Auto-filled default notes
    const notesInput = screen.getByDisplayValue(/บันทึกจำหน่ายเนื่องจากสำเนาสูญหายตามคำร้อง หากตรวจพบภายหลังต้องส่งทำลายทันที/i);
    expect(notesInput).toBeInTheDocument();
  });

  it('6. Lost & Voided: allows submission even with zero physical copies checked and calls onComplete with LOST_VOIDED', () => {
    render(
      <DccRecallActionModal
        isOpen={true}
        onClose={mockClose}
        group={mockGroup}
        onComplete={mockComplete}
      />
    );

    // Unselect all copies
    const toggleAllBtn = screen.getByText(/ยกเลิกทั้งหมด/i);
    fireEvent.click(toggleAllBtn);

    const submitBtn = screen.getByRole('button', { name: /บันทึกการจัดการสำเนาและลงทะเบียน/i });
    expect(submitBtn).toBeDisabled();

    // Select Lost & Voided
    const lostVoidRadio = screen.getByRole('radio', { name: /บันทึกสูญหาย \(Lost\/Void\)/i });
    fireEvent.click(lostVoidRadio);

    // Submit button should now be ENABLED due to physical bypass
    expect(submitBtn).not.toBeDisabled();
    expect(screen.getByText(/✓ พร้อมจำหน่ายสูญหาย \(2 ชุด — ไม่มีเล่มจริง\)/i)).toBeInTheDocument();

    // Submit
    fireEvent.click(submitBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        collectedCopyIds: ['cp-01', 'cp-02'],
        dispositionMethod: 'LOST_VOIDED',
        notes: expect.stringContaining('บันทึกจำหน่ายเนื่องจากสำเนาสูญหายตามคำร้อง')
      })
    );
  });

  it('7. Store Integration: completeCopyRecallAndArchive sets LOST_VOIDED, logs DISPOSE_CONTROLLED_COPY_LOST, and completes recall task', () => {
    useStore.setState({
      currentUser: { id: 'U001', name: 'นางสาว สมศรี รักงาน', role: 'DCC' },
      controlledCopyInstances: [
        { id: 'cp-01', doc_code: 'SOP-PD-01', copy_no: '01', status: 'PENDING_RECALL', department: 'PD' },
        { id: 'cp-02', doc_code: 'SOP-PD-01', copy_no: '02', status: 'PENDING_RECALL', department: 'QC' }
      ],
      tasks: [
        { id: 'TASK-RECALL-001', type: 'DCC_RECALL', doc_code: 'SOP-PD-01', status: 'IN_PROGRESS', is_completed: false }
      ],
      controlledCopyAuditTrail: [],
      copyDispositionRecords: [],
      actionLog: []
    });

    const { completeCopyRecallAndArchive } = useStore.getState();
    completeCopyRecallAndArchive({
      documentCode: 'SOP-PD-01',
      collectedCopyIds: ['cp-01', 'cp-02'],
      dispositionMethod: 'LOST_VOIDED',
      witnessName: 'หัวหน้าแผนก PD',
      referenceNo: 'MEMO-LOST-2026-001',
      notes: 'บันทึกจำหน่ายเนื่องจากสำเนาสูญหายตามคำร้อง หากตรวจพบภายหลังต้องส่งทำลายทันที',
      taskId: 'TASK-RECALL-001'
    });

    const state = useStore.getState();
    const copy1 = state.controlledCopyInstances.find(c => c.id === 'cp-01');
    const copy2 = state.controlledCopyInstances.find(c => c.id === 'cp-02');

    // Copies updated to LOST_VOIDED
    expect(copy1.status).toBe('LOST_VOIDED');
    expect(copy1.dispositionMethod).toBe('LOST_VOIDED');
    expect(copy1.disposedBy).toBe('นางสาว สมศรี รักงาน');
    expect(copy1.dateVoided).toBeDefined();

    expect(copy2.status).toBe('LOST_VOIDED');
    expect(copy2.dispositionMethod).toBe('LOST_VOIDED');

    // Audit log has DISPOSE_CONTROLLED_COPY_LOST
    const audit = state.controlledCopyAuditTrail.find(a => a.action === 'DISPOSE_CONTROLLED_COPY_LOST');
    expect(audit).toBeDefined();
    expect(audit.user).toBe('นางสาว สมศรี รักงาน');

    // Ledger record
    const record = state.copyDispositionRecords.find(r => r.copyId === 'cp-01');
    expect(record).toBeDefined();
    expect(record.dispositionType).toBe('LOST_VOIDED');
    expect(record.dispositionMethod).toBe('LOST_VOIDED');
    expect(record.referenceNo).toBe('MEMO-LOST-2026-001');

    // Task resolved and cleaned up from active DCC tasks
    const task = state.tasks.find(t => t.id === 'TASK-RECALL-001');
    expect(task).toBeUndefined();
  });
});

