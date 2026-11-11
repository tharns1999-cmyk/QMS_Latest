import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore, { isNotificationVisibleToUser } from '../../../store/useStore';
import NotificationPopover from '../../../app/layout/NotificationPopover';
import { resetVccLocalStore } from '../api/vccApi';
import {
  notifyPlanWorkflowEvent,
  fetchVccPlans,
  fetchVccPlanDetail,
  saveVccPlanItem,
  submitVccPlan,
  reviewVccPlan,
  approveVccPlan,
  rejectVccPlan
} from '../api/vccPlanApi';
import { resolveNotificationNavigation } from '../../dcc/utils/notificationRouter';

describe('VCC Annual Plan Workflow Event Notifications', () => {
  const beamL4 = {
    id: 'usr-beam',
    name: 'บีม (ผู้จัดทำ)',
    department: 'QC',
    departments: ['QC'],
    approval_level: 4,
    isDcc: false,
    isQmr: false
  };

  const qcColleagueL4 = {
    id: 'usr-qc-colleague',
    name: 'สมชาย QC',
    department: 'QC',
    departments: ['QC'],
    approval_level: 4,
    isDcc: false,
    isQmr: false
  };

  const reviewerQcL5 = {
    id: 'usr-rev-qc',
    name: 'หัวหน้าแผนก QC (Reviewer)',
    department: 'QC',
    departments: ['QC'],
    approval_level: 5,
    isDcc: false,
    isQmr: false
  };

  const reviewerLbL5 = {
    id: 'usr-rev-lb',
    name: 'หัวหน้าแผนก LB',
    department: 'LB',
    departments: ['LB'],
    approval_level: 5,
    isDcc: false,
    isQmr: false
  };

  const approverQmrL6 = {
    id: 'usr-qmr',
    name: 'ผู้จัดการ QMR (Approver)',
    department: 'MGT',
    departments: ['MGT'],
    approval_level: 6,
    isDcc: false,
    isQmr: true
  };

  const dccAdmin = {
    id: 'usr-dcc',
    name: 'เจ้าหน้าที่ DCC',
    department: 'DC',
    departments: ['DC'],
    approval_level: 4,
    isDcc: true,
    isQmr: false
  };

  const samplePlan = {
    id: 'vcc-plan-test-01',
    plan_year: 2026,
    year: 2026,
    department: 'QC',
    revision: '01',
    title: 'แผนการทวนสอบเครื่องมือประจำปี 2026 (QC)',
    status: 'DRAFT',
    prepared_by: 'usr-beam',
    prepared_by_name: 'บีม (ผู้จัดทำ)',
    created_by: 'usr-beam',
    assigned_reviewer_id: 'usr-rev-qc',
    assigned_approver_id: 'usr-qmr'
  };

  beforeEach(() => {
    useStore.getState().resetStore?.();
    useStore.setState({
      notifications: [],
      currentUser: beamL4,
      masterUsers: [beamL4, qcColleagueL4, reviewerQcL5, reviewerLbL5, approverQmrL6, dccAdmin]
    });
  });

  it('1. PENDING_REVIEW: creates notification for Reviewer L5 with required format & visibility', () => {
    const notif = notifyPlanWorkflowEvent({
      type: 'VCC_PLAN_PENDING_REVIEW',
      plan: samplePlan,
      user: beamL4,
      reviewerId: 'usr-rev-qc',
      approverId: 'usr-qmr'
    });

    expect(notif).toBeDefined();
    expect(notif.title).toBe('แผนการทวนสอบประจำปีรอการทบทวน');
    expect(notif.message).toBe('แผนประจำปี 2026 (QC) ส่งเข้าสู่กระบวนการทบทวนโดย บีม (ผู้จัดทำ)');
    expect(notif.type).toBe('VCC_PLAN_PENDING_REVIEW');
    expect(notif.severity).toBe('INFO');
    expect(notif.link).toBe('/vcc/plans');
    expect(notif.module).toBe('VCC');

    // Store contains notification
    const state = useStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].id).toBe(notif.id);

    // Visibility: Reviewer QC (L5) sees it
    expect(isNotificationVisibleToUser(notif, reviewerQcL5)).toBe(true);
    // Approver QMR (L6) and DCC see it (global oversight)
    expect(isNotificationVisibleToUser(notif, approverQmrL6)).toBe(true);
    expect(isNotificationVisibleToUser(notif, dccAdmin)).toBe(true);

    // Other dept reviewer does NOT see it
    expect(isNotificationVisibleToUser(notif, reviewerLbL5)).toBe(false);
    // Beam (Creator, L4) does NOT see review notification of own plan
    expect(isNotificationVisibleToUser(notif, beamL4)).toBe(false);
    // QC colleague (L4) does NOT see it
    expect(isNotificationVisibleToUser(notif, qcColleagueL4)).toBe(false);
  });

  it('2. PENDING_APPROVAL: creates notification for Approver (QMR/L6+) with required format & visibility', () => {
    const reviewedPlan = {
      ...samplePlan,
      status: 'PENDING_APPROVAL',
      reviewed_by: 'usr-rev-qc',
      reviewed_by_name: 'หัวหน้าแผนก QC (Reviewer)',
      review_comment: 'ตรวจสอบความถูกต้องเรียบร้อยแล้ว'
    };

    const notif = notifyPlanWorkflowEvent({
      type: 'VCC_PLAN_PENDING_APPROVAL',
      plan: reviewedPlan,
      user: reviewerQcL5,
      comment: 'ตรวจสอบความถูกต้องเรียบร้อยแล้ว'
    });

    expect(notif.title).toBe('แผนการทวนสอบประจำปีรอการอนุมัติ');
    expect(notif.message).toBe('แผนประจำปี 2026 (QC) ได้รับการทบทวนแล้ว รอการอนุมัติขั้นสุดท้าย');
    expect(notif.type).toBe('VCC_PLAN_PENDING_APPROVAL');
    expect(notif.severity).toBe('INFO');
    expect(notif.link).toBe('/vcc/plans');

    // Visibility: Approver QMR (L6) sees it
    expect(isNotificationVisibleToUser(notif, approverQmrL6)).toBe(true);
    expect(isNotificationVisibleToUser(notif, dccAdmin)).toBe(true);

    // Creator (Beam L4) and Reviewer (L5) do NOT see pending approval step
    expect(isNotificationVisibleToUser(notif, beamL4)).toBe(false);
    expect(isNotificationVisibleToUser(notif, reviewerQcL5)).toBe(false);
    expect(isNotificationVisibleToUser(notif, qcColleagueL4)).toBe(false);
    expect(isNotificationVisibleToUser(notif, reviewerLbL5)).toBe(false);
  });

  it('3. APPROVED: creates notification for Creator and QC Department team with required format & visibility', () => {
    const approvedPlan = {
      ...samplePlan,
      status: 'APPROVED',
      revision: '01',
      approved_by: 'usr-qmr',
      approved_by_name: 'ผู้จัดการ QMR (Approver)',
      approval_comment: 'อนุมัติให้ใช้งานตามแผน'
    };

    const notif = notifyPlanWorkflowEvent({
      type: 'VCC_PLAN_APPROVED',
      plan: approvedPlan,
      user: approverQmrL6,
      comment: 'อนุมัติให้ใช้งานตามแผน'
    });

    expect(notif.title).toBe('แผนการทวนสอบประจำปีได้รับการอนุมัติแล้ว');
    expect(notif.message).toBe('แผนประจำปี 2026 (QC) Rev.01 ได้รับการอนุมัติและมีผลบังคับใช้แล้ว');
    expect(notif.type).toBe('VCC_PLAN_APPROVED');
    expect(notif.severity).toBe('SUCCESS');
    expect(notif.link).toBe('/vcc/plans');

    // Visibility: Beam (Creator, L4) MUST see it immediately!
    expect(isNotificationVisibleToUser(notif, beamL4)).toBe(true);
    // Team in QC department sees it
    expect(isNotificationVisibleToUser(notif, qcColleagueL4)).toBe(true);
    expect(isNotificationVisibleToUser(notif, reviewerQcL5)).toBe(true);

    // DCC and QMR see it
    expect(isNotificationVisibleToUser(notif, approverQmrL6)).toBe(true);
    expect(isNotificationVisibleToUser(notif, dccAdmin)).toBe(true);

    // Other department members (LB) do NOT see it
    expect(isNotificationVisibleToUser(notif, reviewerLbL5)).toBe(false);
  });

  it('4. RETURNED/REJECTED: creates notification strictly for Creator with reviewer note', () => {
    const returnedPlan = {
      ...samplePlan,
      status: 'REJECTED',
      rejected_by: 'usr-rev-qc',
      rejected_by_name: 'หัวหน้าแผนก QC (Reviewer)',
      rejected_reason: 'กรุณาแก้ไขเดือนสอบเทียบเครื่องชั่งน้ำหนัก'
    };

    const notif = notifyPlanWorkflowEvent({
      type: 'VCC_PLAN_RETURNED',
      plan: returnedPlan,
      user: reviewerQcL5,
      reason: 'กรุณาแก้ไขเดือนสอบเทียบเครื่องชั่งน้ำหนัก'
    });

    expect(notif.title).toBe('แผนการทวนสอบประจำปีถูกส่งกลับแก้ไข');
    expect(notif.message).toBe('แผนประจำปี 2026 (QC) ถูกส่งกลับแก้ไขโดย หัวหน้าแผนก QC (Reviewer): กรุณาแก้ไขเดือนสอบเทียบเครื่องชั่งน้ำหนัก');
    expect(notif.type).toBe('VCC_PLAN_RETURNED');
    expect(notif.severity).toBe('WARNING');
    expect(notif.link).toBe('/vcc/plans');

    // Visibility: ONLY Creator (Beam L4) sees the return notice
    expect(isNotificationVisibleToUser(notif, beamL4)).toBe(true);

    // Colleague in QC does NOT see someone else\'s return notice
    expect(isNotificationVisibleToUser(notif, qcColleagueL4)).toBe(false);
    // Reviewer in other dept does NOT see it
    expect(isNotificationVisibleToUser(notif, reviewerLbL5)).toBe(false);
  });

  it('5. Deep navigation router: resolves VCC_PLAN notification directly to /vcc/plans', () => {
    const notif = {
      id: 'notif-123',
      category: 'VCC_PLAN',
      module: 'VCC',
      type: 'VCC_PLAN_APPROVED',
      link: '/vcc/plans'
    };

    const target = resolveNotificationNavigation(notif, useStore.getState());
    expect(target.path).toBe('/vcc/plans');
  });

  it('6. Deep navigation router: falls back safely to /vcc/plans even if link is missing', () => {
    const notif = {
      id: 'notif-456',
      category: 'VCC_PLAN',
      title: 'แผนการทวนสอบประจำปีรอการทบทวน'
    };

    const target = resolveNotificationNavigation(notif, useStore.getState());
    expect(target.path).toBe('/vcc/plans');
  });

  it('7. Workflow integration: submitVccPlan dispatches PENDING_REVIEW notification', async () => {
    resetVccLocalStore();
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const qcPlan = plans.find((p) => p.department === 'QC') || plans[0];
    const planDetail = await fetchVccPlanDetail(qcPlan.id);
    for (const item of planDetail.items) {
      await saveVccPlanItem(qcPlan.id, {
        asset_id: item.asset_id,
        provider_name: 'ทวนสอบภายใน',
        responsible_dept: 'QC',
        planned_months: [3, 9],
        remarks: 'มีแผนทวนสอบแล้ว'
      });
    }

    useStore.setState({
      currentUser: beamL4,
      notifications: []
    });

    await submitVccPlan(qcPlan.id, {
      reviewer_id: 'usr-rev-qc',
      approver_id: 'usr-qmr'
    });

    const notifs = useStore.getState().notifications;
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    const subNotif = notifs.find((n) => n.type === 'VCC_PLAN_PENDING_REVIEW');
    expect(subNotif).toBeDefined();
    expect(subNotif.title).toBe('แผนการทวนสอบประจำปีรอการทบทวน');
    expect(subNotif.link).toBe('/vcc/plans');
    expect(isNotificationVisibleToUser(subNotif, reviewerQcL5)).toBe(true);
    expect(isNotificationVisibleToUser(subNotif, beamL4)).toBe(false);
  });

  it('8. Workflow integration: reviewVccPlan dispatches PENDING_APPROVAL notification', async () => {
    const STORAGE_PLANS_KEY = 'qms-vcc-local-plans-v1';
    const planToReview = {
      ...samplePlan,
      id: 'vcc-plan-workflow-review',
      status: 'PENDING_REVIEW',
      prepared_by: 'usr-beam',
      assigned_reviewer_id: 'usr-rev-qc',
      assigned_approver_id: 'usr-qmr'
    };
    window.localStorage.setItem(STORAGE_PLANS_KEY, JSON.stringify([planToReview]));

    useStore.setState({
      currentUser: reviewerQcL5,
      notifications: []
    });

    await reviewVccPlan('vcc-plan-workflow-review', 'ผ่านการทบทวนแล้ว');

    const notifs = useStore.getState().notifications;
    const revNotif = notifs.find((n) => n.type === 'VCC_PLAN_PENDING_APPROVAL');
    expect(revNotif).toBeDefined();
    expect(revNotif.title).toBe('แผนการทวนสอบประจำปีรอการอนุมัติ');
    expect(revNotif.link).toBe('/vcc/plans');
    expect(isNotificationVisibleToUser(revNotif, approverQmrL6)).toBe(true);
    expect(isNotificationVisibleToUser(revNotif, beamL4)).toBe(false);
  });

  it('9. Workflow integration: approveVccPlan dispatches APPROVED notification to Beam (L4)', async () => {
    const STORAGE_PLANS_KEY = 'qms-vcc-local-plans-v1';
    const planToApprove = {
      ...samplePlan,
      id: 'vcc-plan-workflow-approve',
      status: 'PENDING_APPROVAL',
      prepared_by: 'usr-beam',
      reviewed_by: 'usr-rev-qc',
      assigned_approver_id: 'usr-qmr'
    };
    window.localStorage.setItem(STORAGE_PLANS_KEY, JSON.stringify([planToApprove]));

    useStore.setState({
      currentUser: approverQmrL6,
      notifications: []
    });

    await approveVccPlan('vcc-plan-workflow-approve', 'อนุมัติเรียบร้อย');

    const notifs = useStore.getState().notifications;
    const appNotif = notifs.find((n) => n.type === 'VCC_PLAN_APPROVED');
    expect(appNotif).toBeDefined();
    expect(appNotif.title).toBe('แผนการทวนสอบประจำปีได้รับการอนุมัติแล้ว');
    expect(appNotif.severity).toBe('SUCCESS');
    expect(appNotif.link).toBe('/vcc/plans');
    // Creator (Beam L4) MUST see it!
    expect(isNotificationVisibleToUser(appNotif, beamL4)).toBe(true);
  });

  it('10. Workflow integration: rejectVccPlan dispatches RETURNED notification strictly to Beam (L4)', async () => {
    const STORAGE_PLANS_KEY = 'qms-vcc-local-plans-v1';
    const planToReject = {
      ...samplePlan,
      id: 'vcc-plan-workflow-reject',
      status: 'PENDING_REVIEW',
      prepared_by: 'usr-beam',
      assigned_reviewer_id: 'usr-rev-qc'
    };
    window.localStorage.setItem(STORAGE_PLANS_KEY, JSON.stringify([planToReject]));

    useStore.setState({
      currentUser: reviewerQcL5,
      notifications: []
    });

    await rejectVccPlan('vcc-plan-workflow-reject', 'กรุณาระบุเดือนทวนสอบให้ครบถ้วน');

    const notifs = useStore.getState().notifications;
    const retNotif = notifs.find((n) => n.type === 'VCC_PLAN_RETURNED');
    expect(retNotif).toBeDefined();
    expect(retNotif.title).toBe('แผนการทวนสอบประจำปีถูกส่งกลับแก้ไข');
    expect(retNotif.severity).toBe('WARNING');
    expect(retNotif.link).toBe('/vcc/plans');
    expect(retNotif.message).toContain('กรุณาระบุเดือนทวนสอบให้ครบถ้วน');
    // ONLY Creator (Beam L4) sees the return notice
    expect(isNotificationVisibleToUser(retNotif, beamL4)).toBe(true);
    expect(isNotificationVisibleToUser(retNotif, qcColleagueL4)).toBe(false);
    expect(isNotificationVisibleToUser(retNotif, reviewerLbL5)).toBe(false);
  });

  it('11. NotificationPopover UI: displays filtered unread badge & items specifically for Beam (L4)', () => {
    useStore.setState({
      currentUser: beamL4,
      notifications: [
        {
          id: 'n-review',
          title: 'แผนการทวนสอบประจำปีรอการทบทวน',
          message: 'แผนประจำปี 2026 (QC) ส่งเข้าสู่กระบวนการทบทวน',
          type: 'VCC_PLAN_PENDING_REVIEW',
          targetDepartment: 'QC',
          targetRole: 'REVIEWER',
          minApprovalLevel: 5,
          link: '/vcc/plans',
          isRead: false,
          created_at: new Date().toISOString()
        },
        {
          id: 'n-approved',
          title: 'แผนการทวนสอบประจำปีได้รับการอนุมัติแล้ว',
          message: 'แผนประจำปี 2026 (QC) Rev.01 ได้รับการอนุมัติและมีผลบังคับใช้แล้ว',
          type: 'VCC_PLAN_APPROVED',
          targetDepartment: 'QC',
          targetUserId: 'usr-beam',
          link: '/vcc/plans',
          isRead: false,
          created_at: new Date().toISOString()
        }
      ],
      vccNotifications: []
    });

    render(
      <MemoryRouter>
        <NotificationPopover />
      </MemoryRouter>
    );

    // Unread count for Beam should be 1 (n-approved), because n-review is only for Reviewer L5+
    const badge = screen.getByText('1');
    expect(badge).toBeInTheDocument();

    // Click trigger to open popover
    const trigger = screen.getByRole('button', { name: /การแจ้งเตือนระบบ/i });
    fireEvent.click(trigger);

    // Popover contains the approved notification
    expect(screen.getByText('แผนการทวนสอบประจำปีได้รับการอนุมัติแล้ว')).toBeInTheDocument();
    // But does NOT contain the review notification
    expect(screen.queryByText('แผนการทวนสอบประจำปีรอการทบทวน')).not.toBeInTheDocument();
  });
});
