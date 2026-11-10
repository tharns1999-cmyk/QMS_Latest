import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  AnnualPlanAuditTrailTimeline,
  AnnualPlanHistoryDrawer,
  aggregateAuditLogs,
  getPlanActionMeta
} from '../components/AnnualPlanAuditTrailTimeline';

describe('VCC Annual Plan — Enterprise Audit Trail Timeline & Aggregation', () => {
  const mockHistory = [
    {
      id: 'log-1',
      action: 'VCC_PLAN_CREATED',
      actor_id: 'u1',
      actor_name: 'สมชาย ผู้จัดการ',
      at: '2026-11-10T08:00:00.000Z',
      details: { plan_year: 2026, department_code: 'QC' }
    },
    // Rapid batch saves within 5 minutes by user u2
    {
      id: 'log-2',
      action: 'VCC_PLAN_ITEM_SAVED',
      actor_id: 'u2',
      actor_name: 'วิภา เจ้าหน้าที่ QC',
      at: '2026-11-10T08:10:00.000Z',
      details: { asset_code: 'EQ-001', asset_name: 'Digital Caliper 150mm', planned_months: [3] }
    },
    {
      id: 'log-3',
      action: 'VCC_PLAN_ITEM_SAVED',
      actor_id: 'u2',
      actor_name: 'วิภา เจ้าหน้าที่ QC',
      at: '2026-11-10T08:11:30.000Z',
      details: { asset_code: 'EQ-002', asset_name: 'Pressure Gauge 10 Bar', planned_months: [4, 10] }
    },
    {
      id: 'log-4',
      action: 'VCC_PLAN_ITEM_SAVED',
      actor_id: 'u2',
      actor_name: 'วิภา เจ้าหน้าที่ QC',
      at: '2026-11-10T08:13:00.000Z',
      details: { asset_code: 'EQ-003', asset_name: 'Micrometer 25mm', planned_months: [6] }
    },
    // Another save much later (15 mins later) by same user -> should NOT be merged with the batch above
    {
      id: 'log-5',
      action: 'VCC_PLAN_ITEM_SAVED',
      actor_id: 'u2',
      actor_name: 'วิภา เจ้าหน้าที่ QC',
      at: '2026-11-10T08:30:00.000Z',
      details: { asset_code: 'EQ-004', asset_name: 'Digital Scale 500g', planned_months: [1] }
    },
    // Workflow submission
    {
      id: 'log-6',
      action: 'VCC_PLAN_SUBMITTED',
      actor_id: 'u2',
      actor_name: 'วิภา เจ้าหน้าที่ QC',
      at: '2026-11-10T08:35:00.000Z',
      details: { comment: 'ขอส่งแผนประจำปี 2026 เพื่อทบทวนรอบแรกค่ะ' }
    },
    // Return with reason
    {
      id: 'log-7',
      action: 'VCC_PLAN_RETURNED',
      actor_id: 'u3',
      actor_name: 'ธวัชชัย หัวหน้าแผนก',
      at: '2026-11-10T09:00:00.000Z',
      details: { reason: 'กรุณาตรวจสอบรอบการสอบเทียบ EQ-002 เนื่องจากเป็นเครื่องมือหลักของห้องต้มไอน้ำ' }
    },
    // Approval
    {
      id: 'log-8',
      action: 'VCC_PLAN_APPROVED',
      actor_id: 'u4',
      actor_name: 'ประวิทย์ ผู้จัดการโรงงาน',
      at: '2026-11-10T11:00:00.000Z',
      details: { comment: 'อนุมัติแผนประจำปี 2026 เรียบร้อยแล้ว' }
    }
  ];

  describe('1. aggregateAuditLogs Logic', () => {
    it('รวมกลุ่ม VCC_PLAN_ITEM_SAVED ของผู้ใช้คนเดียวกันภายใน 5 นาทีเป็น 1 รายการ และแยกรายการที่เกิน 5 นาที', () => {
      const result = aggregateAuditLogs(mockHistory, 5 * 60 * 1000);

      // Total raw items = 8
      // log-2, log-3, log-4 should merge into 1 group (3 items)
      // log-5 is at 08:30:00 (17 mins later) so it is its own group (1 item)
      // log-1 (CREATED), log-6 (SUBMITTED), log-7 (RETURNED), log-8 (APPROVED) are single entries
      // Total aggregated items = 6
      expect(result).toHaveLength(6);

      // Find the aggregated group of 3 items
      const batchGroup = result.find(
        (r) => r.isAggregated && r.items && r.items.length === 3
      );
      expect(batchGroup).toBeDefined();
      expect(batchGroup.action).toBe('VCC_PLAN_ITEM_SAVED');
      expect(batchGroup.actor_name).toBe('วิภา เจ้าหน้าที่ QC');
      expect(batchGroup.items.map((i) => i.id)).toEqual(['log-2', 'log-3', 'log-4']);

      // The later item log-5 is aggregated on its own
      const laterGroup = result.find(
        (r) => r.isAggregated && r.items && r.items.length === 1 && r.items[0].id === 'log-5'
      );
      expect(laterGroup).toBeDefined();
    });

    it('ไม่รวมกลุ่ม VCC_PLAN_ITEM_SAVED หากเป็นคนละผู้ใช้ แม้จะเกิดในนาทีเดียวกัน', () => {
      const concurrentUsersLogs = [
        {
          id: 'diff-1',
          action: 'VCC_PLAN_ITEM_SAVED',
          actor_id: 'userA',
          actor_name: 'User A',
          at: '2026-11-10T10:00:00.000Z',
          details: { asset_code: 'EQ-A' }
        },
        {
          id: 'diff-2',
          action: 'VCC_PLAN_ITEM_SAVED',
          actor_id: 'userB',
          actor_name: 'User B',
          at: '2026-11-10T10:01:00.000Z',
          details: { asset_code: 'EQ-B' }
        }
      ];

      const result = aggregateAuditLogs(concurrentUsersLogs);
      expect(result).toHaveLength(2);
      expect(result[0].items[0].actor_id).not.toBe(result[1].items[0].actor_id);
    });

    it('คืนค่า array ว่างอย่างปลอดภัยเมื่อไม่มีประวัติ', () => {
      expect(aggregateAuditLogs([])).toEqual([]);
      expect(aggregateAuditLogs(null)).toEqual([]);
    });
  });

  describe('2. AnnualPlanAuditTrailTimeline Component', () => {
    it('แสดงหัวข้อ บัญชีรายการ และป้ายสรุปการรวมกลุ่ม', () => {
      render(
        <AnnualPlanAuditTrailTimeline
          history={mockHistory}
          plan={{ form_code: 'FM-QC-46', revision: '01', plan_year: 2026 }}
        />
      );

      // Title & total count badge
      expect(screen.getByText('ประวัติการดำเนินการและหลักฐาน (Audit Trail)')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();

      // Aggregated batch header
      expect(screen.getByText(/ปรับปรุงข้อมูลเครื่องมือ \(3 รายการ\)/i)).toBeInTheDocument();

      // Return reason callout box in soft orange
      const callout = screen.getByTestId('audit-return-callout');
      expect(callout).toBeInTheDocument();
      expect(callout).toHaveTextContent(/กรุณาตรวจสอบรอบการสอบเทียบ EQ-002/i);
    });

    it('สามารถคลิกคลี่-พับ (Accordion) เพื่อดูรหัสเครื่องมือในกลุ่มที่รวมไว้ได้', () => {
      render(<AnnualPlanAuditTrailTimeline history={mockHistory} />);

      // Initially sub-items are not rendered
      expect(screen.queryByTestId('aggregated-items-detail')).toBeNull();

      // Click "ดูรายละเอียด" on the aggregated item
      const toggleBtn = screen.getByRole('button', { name: /คลี่ดูรายละเอียด 3 รายการ/i });
      fireEvent.click(toggleBtn);

      // Aggregated items detail appears
      const detailsContainer = screen.getByTestId('aggregated-items-detail');
      expect(detailsContainer).toBeInTheDocument();
      expect(within(detailsContainer).getByText('EQ-001')).toBeInTheDocument();
      expect(within(detailsContainer).getByText('Digital Caliper 150mm')).toBeInTheDocument();
      expect(within(detailsContainer).getByText('EQ-002')).toBeInTheDocument();
      expect(within(detailsContainer).getByText('EQ-003')).toBeInTheDocument();

      // Click again to collapse
      fireEvent.click(toggleBtn);
      expect(screen.queryByTestId('aggregated-items-detail')).toBeNull();
    });

    it('กรองตามแท็บด่วน [ทั้งหมด], [การอนุมัติ/ส่งกลับ], [การแก้ไขข้อมูล] ได้ถูกต้อง', () => {
      render(<AnnualPlanAuditTrailTimeline history={mockHistory} />);

      // 1. Click "การอนุมัติ/ส่งกลับ"
      const workflowBtn = screen.getByRole('button', { name: /การอนุมัติ\/ส่งกลับ/i });
      fireEvent.click(workflowBtn);

      // Workflow actions should be visible
      expect(screen.getByText('ส่งแผนเข้าสู่การทบทวน')).toBeInTheDocument();
      expect(screen.getByText('ส่งแผนกลับไปแก้ไข')).toBeInTheDocument();
      expect(screen.getByText('อนุมัติแผนประจำปี')).toBeInTheDocument();
      // Data action (VCC_PLAN_ITEM_SAVED) should not be visible
      expect(screen.queryByText(/ปรับปรุงข้อมูลเครื่องมือ \(3 รายการ\)/i)).toBeNull();

      // 2. Click "การแก้ไขข้อมูล"
      const dataBtn = screen.getByRole('button', { name: /การแก้ไขข้อมูล/i });
      fireEvent.click(dataBtn);

      // Data actions should be visible
      expect(screen.getByText(/ปรับปรุงข้อมูลเครื่องมือ \(3 รายการ\)/i)).toBeInTheDocument();
      expect(screen.getByText('จัดทำร่างแผนประจำปี')).toBeInTheDocument();
      // Workflow actions should not be visible
      expect(screen.queryByText('อนุมัติแผนประจำปี')).toBeNull();
      expect(screen.queryByText('ส่งแผนกลับไปแก้ไข')).toBeNull();

      // 3. Click "ทั้งหมด"
      const allBtn = screen.getByRole('button', { name: /ทั้งหมด/i });
      fireEvent.click(allBtn);
      expect(screen.getByText(/ปรับปรุงข้อมูลเครื่องมือ \(3 รายการ\)/i)).toBeInTheDocument();
      expect(screen.getByText('อนุมัติแผนประจำปี')).toBeInTheDocument();
    });

    it('สามารถกดปุ่มพับ-คลี่ Timeline Container เพื่อประหยัดพื้นที่หน้าจอได้', () => {
      render(<AnnualPlanAuditTrailTimeline history={mockHistory} />);

      // Initially open
      expect(screen.getByTestId('audit-timeline-body')).toBeInTheDocument();

      // Click collapse button
      const collapseBtn = screen.getByLabelText('พับประวัติการดำเนินการ');
      fireEvent.click(collapseBtn);

      // Body is collapsed
      expect(screen.queryByTestId('audit-timeline-body')).toBeNull();

      // Click expand button
      const expandBtn = screen.getByLabelText('คลี่ประวัติการดำเนินการ');
      fireEvent.click(expandBtn);
      expect(screen.getByTestId('audit-timeline-body')).toBeInTheDocument();
    });
  });

  describe('3. AnnualPlanHistoryDrawer', () => {
    it('เปิด Slide-over Drawer ดูประวัติฉบับเต็ม ค้นหา และปิดหน้าต่างได้', () => {
      const handleClose = vi.fn();
      const { rerender } = render(
        <AnnualPlanHistoryDrawer
          open={true}
          onClose={handleClose}
          history={mockHistory}
          plan={{ form_code: 'FM-QC-46', revision: '01', plan_year: 2026 }}
        />
      );

      // Drawer dialog rendered
      const dialog = screen.getByRole('dialog', { name: /ประวัติการดำเนินการฉบับเต็ม/i });
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText(/FM-QC-46 • ฉบับ 01 \(ปี 2026\)/i)).toBeInTheDocument();

      // Search inside drawer
      const searchInput = screen.getByPlaceholderText(/ค้นหาชื่อผู้ดำเนินการ, รหัสเครื่องมือ/i);
      fireEvent.change(searchInput, { target: { value: 'สมชาย' } });

      expect(screen.getByText(/สมชาย ผู้จัดการ/i)).toBeInTheDocument();
      expect(screen.queryByText('ประวิทย์ ผู้จัดการโรงงาน')).toBeNull();

      // Close via X button
      const closeBtn = screen.getByLabelText('ปิดหน้าต่างประวัติ');
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);

      // When open=false
      rerender(
        <AnnualPlanHistoryDrawer
          open={false}
          onClose={handleClose}
          history={mockHistory}
        />
      );
      expect(screen.queryByRole('dialog', { name: /ประวัติการดำเนินการฉบับเต็ม/i })).toBeNull();
    });
  });
});
