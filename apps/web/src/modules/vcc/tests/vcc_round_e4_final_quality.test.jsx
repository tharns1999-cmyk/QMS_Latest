import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VCC_TOKENS, VccSkeleton } from '../components/VccDesignSystem';
import { AnnualPlanMatrixTable } from '../components/AnnualPlanMatrixTable';
import { AssetFormModal, AssetStatusModal, AssetDetailHistoryModal, AssetTypesModal } from '../components/AssetRegisterModals';
import { WorkOrderSideDrawer } from '../components/WorkOrderSideDrawer';

describe('VCC Round E4 — Final Technical Quality & Accessibility Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. WCAG 2.1 AA Accessibility & Contrast Tokens', () => {
    it('VCC_TOKENS.button contains high-contrast focus-visible rings with offset for keyboard navigation', () => {
      expect(VCC_TOKENS.button.primary).toContain('focus-visible:ring-2');
      expect(VCC_TOKENS.button.primary).toContain('focus-visible:ring-offset-2');
      expect(VCC_TOKENS.button.secondary).toContain('focus-visible:ring-2');
      expect(VCC_TOKENS.button.success).toContain('focus-visible:ring-2');
      expect(VCC_TOKENS.button.danger).toContain('focus-visible:ring-2');
      expect(VCC_TOKENS.button.ghost).toContain('focus-visible:ring-2');
      expect(VCC_TOKENS.button.dangerGhost).toContain('focus-visible:ring-2');
    });

    it('VCC_TOKENS input and select have accessible focus-visible rings', () => {
      expect(VCC_TOKENS.input).toContain('focus-visible:ring-2');
      expect(VCC_TOKENS.select).toContain('focus-visible:ring-2');
    });

    it('VccSkeleton honors reduced motion with motion-reduce:animate-none', () => {
      const { container } = render(<VccSkeleton count={2} />);
      const skeletonRoot = container.firstElementChild;
      expect(skeletonRoot).toHaveClass('motion-reduce:animate-none');
      expect(skeletonRoot).toHaveAttribute('role', 'status');
      expect(skeletonRoot).toHaveAttribute('aria-label', 'กำลังโหลดข้อมูล');
    });

    it('AnnualPlanMatrixTable toolbar provides accessible search input and omits duplicate density/view buttons', () => {
      render(
        <AnnualPlanMatrixTable
          planItems={[]}
          activePlan={{ id: 'plan-1', plan_year: 2026, status: 'APPROVED' }}
          workOrders={[]}
          canEditPlan={false}
        />
      );

      expect(screen.getByLabelText('ค้นหารหัสหรือชื่อเครื่องมือในตาราง')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'สบายตา' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'กะทัดรัด' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '12 เดือน (เต็ม)' })).not.toBeInTheDocument();
    });
  });

  describe('2. Mobile Responsiveness & Bottom Sheet Touch Targets', () => {
    it('AssetFormModal renders mobile bottom sheet structure with safe-area spacing and min 44px close target', () => {
      render(
        <AssetFormModal
          formOpen={true}
          setFormOpen={vi.fn()}
          editingAsset={null}
          form={{
            asset_code: 'CAL-01',
            name: 'Digital Caliper',
            asset_type: 'เวอร์เนียร์คาลิปเปอร์',
            department: 'QC',
            group_nature: 'LOGICAL_GROUP'
          }}
          setForm={vi.fn()}
          formError=""
          savingForm={false}
          handleSaveAsset={vi.fn()}
          activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]}
        />
      );

      const dialog = screen.getByRole('dialog', { name: /เพิ่มเครื่องมือวัดใหม่/ });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveClass('rounded-t-3xl');
      expect(dialog).toHaveClass('sm:rounded-2xl');

      const closeBtn = screen.getByRole('button', { name: 'ปิดหน้าต่าง' });
      expect(closeBtn).toHaveClass('min-w-[44px]');
      expect(closeBtn).toHaveClass('min-h-[44px]');

      const cancelBtn = screen.getByRole('button', { name: 'ยกเลิก' });
      expect(cancelBtn).toHaveClass('min-h-[44px]');
    });

    it('AssetStatusModal renders accessible alertdialog with safe-area padding for RETIRE mode', () => {
      render(
        <AssetStatusModal
          statusModal={{ mode: 'RETIRE', asset: { asset_code: 'CAL-01', name: 'Digital Caliper', department: 'QC', asset_type: 'เวอร์เนียร์' } }}
          setStatusModal={vi.fn()}
          statusReason=""
          setStatusReason={vi.fn()}
          statusError=""
          statusImpact={{ open_work_orders: 0, plan_items: 1, closed_work_orders: 5 }}
          savingStatus={false}
          handleConfirmStatusChange={vi.fn()}
        />
      );

      const alertdialog = screen.getByRole('alertdialog');
      expect(alertdialog).toBeInTheDocument();
      expect(alertdialog).toHaveClass('rounded-t-3xl');

      const closeBtn = screen.getByRole('button', { name: 'ปิดหน้าต่าง' });
      expect(closeBtn).toHaveClass('min-w-[44px]');
      expect(closeBtn).toHaveClass('min-h-[44px]');
    });

    it('AssetDetailHistoryModal renders accessible bottom footer close button for mobile ergonomics', () => {
      render(
        <AssetDetailHistoryModal
          detailModalOpen={true}
          setDetailModalOpen={vi.fn()}
          loadingDetail={false}
          detailData={{
            asset: {
              asset_code: 'MIC-01',
              name: 'Micrometer',
              asset_type: 'ไมโครมิเตอร์',
              department: 'QC',
              status: 'ACTIVE'
            },
            history: []
          }}
        />
      );

      const bottomCloseBtns = screen.getAllByRole('button', { name: 'ปิดหน้าต่าง' });
      expect(bottomCloseBtns.length).toBeGreaterThanOrEqual(1);
      const footerBtn = bottomCloseBtns.find((b) => b.textContent === 'ปิดหน้าต่าง');
      expect(footerBtn).toBeInTheDocument();
      expect(footerBtn).toHaveClass('min-h-[44px]');
    });

    it('AssetTypesModal renders responsive layout with min 44px close target', () => {
      render(
        <AssetTypesModal
          typesModalOpen={true}
          setTypesModalOpen={vi.fn()}
          newTypeName=""
          setNewTypeName={vi.fn()}
          handleAddDraftType={vi.fn()}
          draftTypes={['เครื่องชั่ง', 'เทอร์โมมิเตอร์']}
          handleRemoveDraftType={vi.fn()}
          savingTypes={false}
          handleSaveTypes={vi.fn()}
        />
      );

      const dialog = screen.getByRole('dialog', { name: /ตั้งค่ารายการประเภทเครื่องมือ/ });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveClass('rounded-t-3xl');

      const closeBtn = screen.getByRole('button', { name: 'ปิดหน้าต่าง' });
      expect(closeBtn).toHaveClass('min-w-[44px]');
      expect(closeBtn).toHaveClass('min-h-[44px]');
    });
  });

  describe('3. WorkOrderSideDrawer Keyboard & Ergonomics', () => {
    it('WorkOrderSideDrawer renders action buttons with accessible focus rings and min 44px height', () => {
      render(
        <WorkOrderSideDrawer
          workOrder={{
            id: 'wo-1',
            wo_code: 'WO-QC-2026-001',
            asset_code: 'CAL-001',
            asset_name: 'Vernier Caliper',
            department: 'QC',
            status: 'OPEN',
            due_date: '2026-12-01'
          }}
          onClose={vi.fn()}
          thresholds={{ required_approver_level: 5 }}
          onRecordResult={vi.fn()}
          onReschedule={vi.fn()}
        />
      );

      const recordBtn = screen.getByRole('button', { name: /บันทึกผลและใบรับรอง/ });
      expect(recordBtn).toBeInTheDocument();
      expect(recordBtn).toHaveClass('min-h-[44px]');
      expect(recordBtn).toHaveClass('focus-visible:ring-2');

      const closeBtn = screen.getByRole('button', { name: 'ปิดหน้าต่าง' });
      expect(closeBtn).toHaveClass('min-h-[44px]');
      expect(closeBtn).toHaveClass('focus-visible:ring-2');
    });
  });
});
