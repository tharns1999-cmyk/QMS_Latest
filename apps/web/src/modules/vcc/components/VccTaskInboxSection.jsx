import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Clock,
  AlertTriangle,
  FileEdit,
  Eye,
  ArrowLeft,
  ArrowRight,
  Calendar,
  History,
  CheckSquare
} from 'lucide-react';
import useStore from '../../../store/useStore';
import {
  fetchVccPlans,
  fetchVccPlanDetail,
  fetchVccPlanSettings,
  reviewVccPlan,
  approveVccPlan,
  rejectVccPlan,
  syncVccTasks,
  isUserAuthorizedForPlanDept
} from '../api/vccPlanApi';
import { getPlanStatusLabel, getDueDateRuleLabel } from '../utils/planLabels';
import { PlanWorkflowModal } from './AnnualPlanModals';

const MONTH_LABELS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const formatThaiDateTime = (iso) => {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
};

const getActionLabelThai = (action) => {
  switch (action) {
    case 'VCC_PLAN_CREATED':
      return 'สร้างแผนประจำปีฉบับร่าง';
    case 'VCC_PLAN_UPDATED':
      return 'แก้ไขข้อมูลหัวแผน';
    case 'VCC_PLAN_SUBMITTED':
      return 'ส่งแผนเข้าสู่การทบทวน';
    case 'VCC_PLAN_REVIEWED':
      return 'ยืนยันการทบทวนแผน (ส่งต่ออนุมัติ)';
    case 'VCC_PLAN_APPROVED':
      return 'อนุมัติแผนประจำปี';
    case 'VCC_PLAN_REJECTED':
      return 'ส่งแผนกลับไปแก้ไข';
    default:
      return action;
  }
};

const TABS = [
  { id: 'MY_TASKS', label: 'งานที่ต้องทำของฉัน' },
  { id: 'PENDING_REVIEW', label: 'งานรอทบทวน' },
  { id: 'PENDING_APPROVAL', label: 'งานรออนุมัติ' },
  { id: 'REJECTED', label: 'งานส่งกลับให้แก้ไข' },
  { id: 'WAITING_OTHERS', label: 'งานที่กำลังรอผู้อื่นดำเนินการ' },
  { id: 'COMPLETED', label: 'งานที่ดำเนินการแล้ว' }
];

/**
 * VccTaskInboxSection — ศูนย์กลางการทบทวนและอนุมัติแผนประจำปี VCC (FM-QC-46)
 * แยกออกจาก Planning Workspace อย่างเด็ดขาด:
 * - รายการงานตามผู้รับผิดชอบและสิทธิ์จริง (ไม่ใช่เพียงสถานะเอกสาร)
 * - Dedicated Task Detail สำหรับพิจารณา ทบทวน / อนุมัติ / ส่งกลับแก้ไข พร้อมตาราง Read-only และประวัติครบถ้วน
 */
export const VccTaskInboxSection = () => {
  const { currentUser } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryPlanId = searchParams.get('id') || searchParams.get('planId') || '';
  const queryAction = (searchParams.get('action') || '').toUpperCase();
  const queryFilter = searchParams.get('filter') || '';

  const [activeFilter, setActiveFilter] = useState(queryFilter || 'MY_TASKS');
  const [allPlans, setAllPlans] = useState([]);
  const [thresholds, setThresholds] = useState({
    min_requester_level: 1,
    required_reviewer_level: 4,
    required_approver_level: 5
  });
  const [loading, setLoading] = useState(true);

  // Dedicated Task Detail State
  const [selectedPlanId, setSelectedPlanId] = useState(queryPlanId);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Confirmation Dialog State
  const [workflowModal, setWorkflowModal] = useState(null);
  const [workflowComment, setWorkflowComment] = useState('');
  const [workflowError, setWorkflowError] = useState('');
  const [savingWorkflow, setSavingWorkflow] = useState(false);

  const loadAllWorkflowData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, plansList] = await Promise.all([
        fetchVccPlanSettings(),
        fetchVccPlans({ status: 'ALL' })
      ]);
      if (settingsRes?.thresholds) {
        setThresholds(settingsRes.thresholds);
      }
      setAllPlans(plansList || []);
      await syncVccTasks(currentUser).catch(() => {});
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดรายการงาน VCC ได้');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const loadTaskDetail = useCallback(async (planId) => {
    if (!planId) {
      setDetailData(null);
      setDetailError('');
      return;
    }
    setLoadingDetail(true);
    setDetailError('');
    try {
      const detail = await fetchVccPlanDetail(planId);
      setDetailData(detail);
    } catch (err) {
      setDetailData(null);
      setDetailError(err.message || 'ไม่พบข้อมูลแผนที่ระบุ หรือแผนอาจถูกลบไปแล้ว');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadAllWorkflowData();
  }, [loadAllWorkflowData]);

  useEffect(() => {
    setSelectedPlanId(queryPlanId);
    if (queryPlanId) {
      loadTaskDetail(queryPlanId);
    } else {
      setDetailData(null);
      setDetailError('');
    }
  }, [queryPlanId, loadTaskDetail]);

  // Evaluate user eligibility and task categorization for each plan
  const evaluatePlanTaskRole = useCallback(
    (plan) => {
      if (!plan || !currentUser) {
        return {
          canReview: false,
          canApprove: false,
          canRevise: false,
          isMyActionable: false,
          isWaitingOthers: false,
          isCompleted: false,
          ineligibleReason: 'กรุณาเข้าสู่ระบบ'
        };
      }
      const userLevel = Number(currentUser.approval_level ?? currentUser.approvalLevel ?? 1);
      const isDeptAllowed = isUserAuthorizedForPlanDept(currentUser, plan.department);
      const isOverrideAdmin = Boolean(currentUser.isDcc || currentUser.isQmr || userLevel >= 6);

      const isAssignedReviewer = plan.assigned_reviewer_id
        ? currentUser.id === plan.assigned_reviewer_id || isOverrideAdmin
        : true;
      const isAssignedApprover = plan.assigned_approver_id
        ? currentUser.id === plan.assigned_approver_id || isOverrideAdmin
        : true;

      const canReview =
        plan.status === 'PENDING_REVIEW' &&
        isDeptAllowed &&
        isAssignedReviewer &&
        currentUser.id !== plan.prepared_by &&
        userLevel >= (thresholds.required_reviewer_level || 4);

      const canApprove =
        plan.status === 'PENDING_APPROVAL' &&
        isDeptAllowed &&
        isAssignedApprover &&
        currentUser.id !== plan.prepared_by &&
        currentUser.id !== plan.reviewed_by &&
        userLevel >= (thresholds.required_approver_level || 5);

      const canRevise =
        plan.status === 'REJECTED' &&
        (currentUser.id === plan.prepared_by || isOverrideAdmin || isDeptAllowed);

      const isMyActionable = canReview || canApprove || canRevise;

      const isCompleted =
        plan.status === 'APPROVED' ||
        (plan.reviewed_by === currentUser.id && plan.status === 'PENDING_APPROVAL') ||
        plan.approved_by === currentUser.id;

      const isWaitingOthers =
        (plan.status === 'PENDING_REVIEW' || plan.status === 'PENDING_APPROVAL' || plan.status === 'REJECTED') &&
        !isMyActionable;

      // Determine why user cannot act if they open detail page
      let ineligibleReason = '';
      if (plan.status === 'APPROVED') {
        ineligibleReason = 'แผนประจำปีฉบับนี้ได้รับการอนุมัติเสร็จสมบูรณ์แล้ว ไม่สามารถดำเนินการซ้ำได้';
      } else if (plan.status === 'DRAFT') {
        ineligibleReason = 'แผนยังอยู่ในสถานะร่าง (DRAFT) ผู้จัดทำยังไม่ได้ส่งทบทวน';
      } else if (plan.status === 'REJECTED') {
        ineligibleReason = canRevise
          ? 'แผนถูกส่งกลับแก้ไข กรุณาเข้าไปแก้ไขในหน้าตารางแผนประจำปีแล้วกดส่งทบทวนอีกครั้ง'
          : `แผนถูกส่งกลับให้ผู้จัดทำ (${plan.prepared_by_name || plan.prepared_by || 'ผู้จัดทำ'}) แก้ไข`;
      } else if (plan.status === 'PENDING_REVIEW') {
        if (currentUser.id === plan.prepared_by) {
          ineligibleReason = 'ผู้จัดทำไม่สามารถทบทวนแผนของตนเองได้ (Separation of Duties)';
        } else if (!isDeptAllowed) {
          ineligibleReason = `คุณไม่มีสิทธิ์ในขอบเขตแผนก ${plan.department}`;
        } else if (!isAssignedReviewer) {
          ineligibleReason = `งานนี้ถูกมอบหมายให้ผู้ทบทวนท่านอื่น (${plan.assigned_reviewer_name || plan.assigned_reviewer_id})`;
        } else if (userLevel < (thresholds.required_reviewer_level || 4)) {
          ineligibleReason = `ต้องมีระดับอนุมัติ L${thresholds.required_reviewer_level || 4} ขึ้นไปตาม Approval Matrix`;
        } else if (queryAction === 'APPROVE') {
          ineligibleReason = 'แผนยังอยู่ในขั้นตอนรอทบทวน ต้องผ่านการทบทวนก่อนจึงจะอนุมัติได้';
        }
      } else if (plan.status === 'PENDING_APPROVAL') {
        if (queryAction === 'REVIEW') {
          ineligibleReason = `งานทบทวนนี้ดำเนินการเสร็จสิ้นแล้วโดย ${plan.reviewed_by_name || plan.reviewed_by || 'ผู้ทบทวน'} ขณะนี้อยู่ในขั้นตอนรออนุมัติ`;
        } else if (currentUser.id === plan.prepared_by) {
          ineligibleReason = 'ผู้จัดทำไม่สามารถอนุมัติแผนของตนเองได้ (Separation of Duties)';
        } else if (currentUser.id === plan.reviewed_by) {
          ineligibleReason = 'ผู้ทบทวนไม่สามารถอนุมัติแผนที่ตนเองเป็นผู้ทบทวนได้ (4-Eyes Principle)';
        } else if (!isDeptAllowed) {
          ineligibleReason = `คุณไม่มีสิทธิ์ในขอบเขตแผนก ${plan.department}`;
        } else if (!isAssignedApprover) {
          ineligibleReason = `งานนี้ถูกมอบหมายให้ผู้อนุมัติท่านอื่น (${plan.assigned_approver_name || plan.assigned_approver_id})`;
        } else if (userLevel < (thresholds.required_approver_level || 5)) {
          ineligibleReason = `ต้องมีระดับอนุมัติ L${thresholds.required_approver_level || 5} ขึ้นไปตาม Approval Matrix`;
        }
      }

      return {
        canReview,
        canApprove,
        canRevise,
        isMyActionable,
        isWaitingOthers,
        isCompleted,
        ineligibleReason
      };
    },
    [currentUser, thresholds, queryAction]
  );

  const enrichedTaskItems = useMemo(() => {
    return allPlans
      .filter((p) => p.status !== 'DRAFT')
      .map((plan) => {
        const roleInfo = evaluatePlanTaskRole(plan);
        return { plan, roleInfo };
      });
  }, [allPlans, evaluatePlanTaskRole]);

  const tabCounts = useMemo(() => {
    return {
      MY_TASKS: enrichedTaskItems.filter((x) => x.roleInfo.isMyActionable).length,
      PENDING_REVIEW: enrichedTaskItems.filter((x) => x.plan.status === 'PENDING_REVIEW' && x.roleInfo.canReview).length,
      PENDING_APPROVAL: enrichedTaskItems.filter((x) => x.plan.status === 'PENDING_APPROVAL' && x.roleInfo.canApprove).length,
      REJECTED: enrichedTaskItems.filter((x) => x.plan.status === 'REJECTED' && x.roleInfo.canRevise).length,
      WAITING_OTHERS: enrichedTaskItems.filter((x) => x.roleInfo.isWaitingOthers).length,
      COMPLETED: enrichedTaskItems.filter((x) => x.roleInfo.isCompleted).length
    };
  }, [enrichedTaskItems]);

  const filteredItems = useMemo(() => {
    switch (activeFilter) {
      case 'PENDING_REVIEW':
        return enrichedTaskItems.filter((x) => x.plan.status === 'PENDING_REVIEW' && x.roleInfo.canReview);
      case 'PENDING_APPROVAL':
        return enrichedTaskItems.filter((x) => x.plan.status === 'PENDING_APPROVAL' && x.roleInfo.canApprove);
      case 'REJECTED':
        return enrichedTaskItems.filter((x) => x.plan.status === 'REJECTED' && x.roleInfo.canRevise);
      case 'WAITING_OTHERS':
        return enrichedTaskItems.filter((x) => x.roleInfo.isWaitingOthers);
      case 'COMPLETED':
        return enrichedTaskItems.filter((x) => x.roleInfo.isCompleted);
      case 'MY_TASKS':
      default:
        return enrichedTaskItems.filter((x) => x.roleInfo.isMyActionable);
    }
  }, [enrichedTaskItems, activeFilter]);

  const handleOpenTaskItem = (plan, roleInfo) => {
    if (plan.status === 'REJECTED' && roleInfo.canRevise) {
      // REVISE -> Navigate directly to Planning Workspace of the returned plan
      navigate(`/vcc/plans?id=${encodeURIComponent(plan.id)}&tab=REJECTED`);
      return;
    }
    const actionType =
      plan.status === 'PENDING_REVIEW'
        ? 'REVIEW'
        : plan.status === 'PENDING_APPROVAL'
          ? 'APPROVE'
          : 'VIEW';
    setSearchParams({ id: plan.id, action: actionType });
  };

  const handleBackToInbox = () => {
    setSearchParams({});
  };

  const openConfirmModal = (mode) => {
    setWorkflowModal({ mode });
    setWorkflowComment('');
    setWorkflowError('');
  };

  const handleConfirmWorkflowAction = async (e) => {
    e.preventDefault();
    if (!detailData?.plan || !workflowModal || savingWorkflow) return;
    setSavingWorkflow(true);
    setWorkflowError('');
    const planId = detailData.plan.id;

    try {
      if (workflowModal.mode === 'REVIEW') {
        await reviewVccPlan(planId, workflowComment);
        toast.success('ยืนยันการทบทวนแผนประจำปีเรียบร้อยแล้ว ส่งต่องานไปยังผู้อนุมัติ');
      } else if (workflowModal.mode === 'APPROVE') {
        await approveVccPlan(planId, workflowComment);
        toast.success('อนุมัติแผนการทวนสอบเครื่องมือประจำปีเรียบร้อยแล้ว');
      } else if (workflowModal.mode === 'REJECT') {
        await rejectVccPlan(planId, workflowComment);
        toast.success('ส่งแผนกลับไปให้ผู้จัดทำแก้ไขเรียบร้อยแล้ว');
      }
      setWorkflowModal(null);
      setSearchParams({ id: planId });
      await Promise.all([loadAllWorkflowData(), loadTaskDetail(planId)]);
    } catch (err) {
      const msg = err.message || 'ไม่สามารถดำเนินการได้ กรุณาตรวจสอบสถานะล่าสุด';
      setWorkflowError(msg);
      toast.error(msg);
      // Reload latest plan detail in case of concurrent modification
      await Promise.all([loadAllWorkflowData(), loadTaskDetail(planId)]);
    } finally {
      setSavingWorkflow(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW 1: DEDICATED VCC TASK DETAIL (เมื่อคลิกเลือกงาน หรือเข้าผ่าน Direct URL ?id=...)
  // ─────────────────────────────────────────────────────────────────────────
  if (selectedPlanId) {
    const activePlan = detailData?.plan;
    const planItems = detailData?.items || [];
    const history = detailData?.history || [];
    const roleInfo = activePlan ? evaluatePlanTaskRole(activePlan) : null;

    // ตรวจสอบว่าเป็นการส่งซ้ำรอบใหม่หรือไม่ และดึงประวัติที่เคยส่งกลับแก้ไข
    const previousRejections = history.filter((h) => h.action === 'VCC_PLAN_REJECTED');
    const submissionCount = history.filter((h) => h.action === 'VCC_PLAN_SUBMITTED').length;

    // หากผู้ทบทวนเข้าลิงก์ ?action=REVIEW แต่งานถูกทบทวนไปแล้ว ให้บล็อกปุ่มดำเนินการและแจ้งสถานะ
    const isStaleActionLink =
      (queryAction === 'REVIEW' && activePlan?.status !== 'PENDING_REVIEW') ||
      (queryAction === 'APPROVE' && activePlan?.status !== 'PENDING_APPROVAL');

    const showReviewActions = Boolean(activePlan && roleInfo?.canReview && !isStaleActionLink);
    const showApproveActions = Boolean(activePlan && roleInfo?.canApprove && !isStaleActionLink);

    return (
      <div className="space-y-4" data-testid="vcc-task-detail-view">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBackToInbox}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>กลับสู่รายการงานที่ต้องดำเนินการ</span>
          </button>

          {activePlan && (
            <button
              type="button"
              onClick={() => navigate(`/vcc/plans?id=${encodeURIComponent(activePlan.id)}&tab=${encodeURIComponent(activePlan.status)}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-medium cursor-pointer"
            >
              <Calendar size={13} />
              <span>เปิดดูในหน้าตารางแผน (Read-only)</span>
            </button>
          )}
        </div>

        {loadingDetail ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
            กำลังโหลดรายละเอียดงานทบทวนและอนุมัติแผนประจำปี...
          </div>
        ) : detailError || !activePlan ? (
          <div
            role="alert"
            data-testid="vcc-task-error-state"
            className="bg-white rounded-2xl border border-rose-200 p-8 text-center space-y-3"
          >
            <AlertTriangle size={28} className="text-rose-600 mx-auto" />
            <div className="text-base font-bold text-slate-800">ไม่สามารถเปิดรายละเอียดงานนี้ได้</div>
            <p className="text-xs text-slate-600">{detailError || 'ไม่พบข้อมูลแผนที่ระบุ'}</p>
            <button
              type="button"
              onClick={handleBackToInbox}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
            >
              กลับไปหน้ารายการงาน
            </button>
          </div>
        ) : (
          <>
            {/* Executive Task Action Header */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {activePlan.document_code} Rev.{activePlan.revision}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      ปี {activePlan.plan_year} (พ.ศ. {Number(activePlan.plan_year) + 543})
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      แผนก {activePlan.department_name_th ? `${activePlan.department_name_th} (${activePlan.department})` : activePlan.department}
                    </span>
                    <span
                      data-testid="task-detail-single-status"
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                        activePlan.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : activePlan.status === 'PENDING_APPROVAL'
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            : activePlan.status === 'PENDING_REVIEW'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      สถานะ: {getPlanStatusLabel(activePlan.status)}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    {activePlan.title}
                  </h2>

                  <p className="text-xs text-slate-500">
                    กติกาวันครบกำหนด: {getDueDateRuleLabel(activePlan.due_date_rule)} · จำนวนเครื่องมือทั้งหมด {planItems.length} รายการ
                    {submissionCount > 1 ? ` · ส่งทบทวนรอบที่ ${submissionCount}` : ''}
                  </p>
                </div>

                {/* Role-Aware Workflow Action Bar (Strictly 1 Primary + 1 Secondary for designated actor) */}
                <div className="shrink-0 flex flex-wrap items-center gap-2">
                  {showReviewActions && (
                    <>
                      <button
                        type="button"
                        data-testid="vcc-task-btn-review"
                        onClick={() => openConfirmModal('REVIEW')}
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
                      >
                        <CheckCircle2 size={15} />
                        <span>ยืนยันการทบทวน</span>
                      </button>
                      <button
                        type="button"
                        data-testid="vcc-task-btn-reject"
                        onClick={() => openConfirmModal('REJECT')}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <XCircle size={15} />
                        <span>ส่งกลับแก้ไข</span>
                      </button>
                    </>
                  )}

                  {showApproveActions && (
                    <>
                      <button
                        type="button"
                        data-testid="vcc-task-btn-approve"
                        onClick={() => openConfirmModal('APPROVE')}
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
                      >
                        <ShieldCheck size={15} />
                        <span>อนุมัติแผน</span>
                      </button>
                      <button
                        type="button"
                        data-testid="vcc-task-btn-reject"
                        onClick={() => openConfirmModal('REJECT')}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <XCircle size={15} />
                        <span>ส่งกลับแก้ไข</span>
                      </button>
                    </>
                  )}

                  {activePlan.status === 'REJECTED' && roleInfo?.canRevise && (
                    <button
                      type="button"
                      onClick={() => navigate(`/vcc/plans?id=${encodeURIComponent(activePlan.id)}&tab=REJECTED`)}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
                    >
                      <FileEdit size={15} />
                      <span>ไปยังหน้าแก้ไขแผนประจำปี</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 3-Step Workflow Progress & Current Responsible Person */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <div className="flex items-center justify-between text-slate-500 font-medium">
                    <span>1. ผู้จัดทำแผน (L{thresholds.min_requester_level || 1}+)</span>
                    {activePlan.prepared_at && <CheckCircle2 size={14} className="text-emerald-600" />}
                  </div>
                  <div className="font-bold text-slate-900">
                    {activePlan.prepared_by_name || activePlan.prepared_by || '-'}
                  </div>
                  {activePlan.prepared_at && (
                    <div className="text-[11px] text-slate-500 font-mono">
                      ส่งเมื่อ {formatThaiDateTime(activePlan.prepared_at)}
                    </div>
                  )}
                </div>

                <div
                  className={`p-3 rounded-xl border space-y-1 ${
                    activePlan.status === 'PENDING_REVIEW'
                      ? 'bg-amber-50/70 border-amber-300'
                      : 'bg-slate-50 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between text-slate-500 font-medium">
                    <span>2. ผู้ทบทวนแผน (L{thresholds.required_reviewer_level || 4}+)</span>
                    {activePlan.reviewed_at ? (
                      <CheckCircle2 size={14} className="text-emerald-600" />
                    ) : activePlan.status === 'PENDING_REVIEW' ? (
                      <Clock size={14} className="text-amber-600" />
                    ) : null}
                  </div>
                  <div className="font-bold text-slate-900">
                    {activePlan.reviewed_by_name ||
                      activePlan.reviewed_by ||
                      activePlan.assigned_reviewer_name ||
                      activePlan.assigned_reviewer_id ||
                      'ผู้ทบทวนตามสิทธิ์แผนก'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {activePlan.reviewed_at
                      ? `ทบทวนเมื่อ ${formatThaiDateTime(activePlan.reviewed_at)}`
                      : activePlan.status === 'PENDING_REVIEW'
                        ? 'ขั้นตอนปัจจุบัน: รอการทบทวน'
                        : 'รอดำเนินการ'}
                  </div>
                  {activePlan.review_comment && (
                    <div className="text-[11px] text-slate-700 bg-white/80 px-2 py-1 rounded border border-slate-200 mt-1">
                      ความเห็น: {activePlan.review_comment}
                    </div>
                  )}
                </div>

                <div
                  className={`p-3 rounded-xl border space-y-1 ${
                    activePlan.status === 'PENDING_APPROVAL'
                      ? 'bg-indigo-50/70 border-indigo-300'
                      : activePlan.status === 'APPROVED'
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : 'bg-slate-50 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between text-slate-500 font-medium">
                    <span>3. ผู้อนุมัติแผน (L{thresholds.required_approver_level || 5}+)</span>
                    {activePlan.approved_at ? (
                      <CheckCircle2 size={14} className="text-emerald-600" />
                    ) : activePlan.status === 'PENDING_APPROVAL' ? (
                      <Clock size={14} className="text-indigo-600" />
                    ) : null}
                  </div>
                  <div className="font-bold text-slate-900">
                    {activePlan.approved_by_name ||
                      activePlan.approved_by ||
                      activePlan.assigned_approver_name ||
                      activePlan.assigned_approver_id ||
                      'ผู้อนุมัติตามสิทธิ์แผนก'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {activePlan.approved_at
                      ? `อนุมัติเมื่อ ${formatThaiDateTime(activePlan.approved_at)}`
                      : activePlan.status === 'PENDING_APPROVAL'
                        ? 'ขั้นตอนปัจจุบัน: รอการอนุมัติ'
                        : 'รอดำเนินการ'}
                  </div>
                  {activePlan.approval_comment && (
                    <div className="text-[11px] text-slate-700 bg-white/80 px-2 py-1 rounded border border-slate-200 mt-1">
                      ความเห็น: {activePlan.approval_comment}
                    </div>
                  )}
                </div>
              </div>

              {/* Notice when task is not actionable by current user or already completed */}
              {!showReviewActions && !showApproveActions && roleInfo?.ineligibleReason && (
                <div
                  role="status"
                  data-testid="vcc-task-non-actionable-banner"
                  className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium flex items-center gap-2"
                >
                  <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                  <span>{roleInfo.ineligibleReason}</span>
                </div>
              )}

              {/* Summary of Changes / Previous Return Reasons (สรุปการเปลี่ยนแปลงและประวัติที่เคยส่งกลับ) */}
              {(activePlan.rejected_reason || previousRejections.length > 0) && (
                <div
                  data-testid="vcc-task-revision-summary"
                  className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-950 text-xs space-y-1.5"
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <History size={14} className="text-amber-700 shrink-0" />
                    <span>
                      {activePlan.status === 'REJECTED'
                        ? 'เหตุผลที่ถูกส่งกลับแก้ไขในรอบปัจจุบัน:'
                        : `ประวัติการส่งกลับแก้ไขและการส่งทบทวนซ้ำ (ส่งทบทวนรอบที่ ${submissionCount}):`}
                    </span>
                  </div>
                  {activePlan.rejected_reason ? (
                    <div className="pl-5 text-amber-900 whitespace-pre-wrap">
                      • {activePlan.rejected_reason}{' '}
                      {activePlan.rejected_by_name || activePlan.rejected_by
                        ? `(โดย ${activePlan.rejected_by_name || activePlan.rejected_by})`
                        : ''}
                    </div>
                  ) : (
                    previousRejections.map((rej) => (
                      <div key={rej.id} className="pl-5 text-amber-900 whitespace-pre-wrap">
                        • เคยส่งกลับเมื่อ {formatThaiDateTime(rej.at)} โดย {rej.actor_name || rej.actor_id}: &ldquo;
                        {rej.details?.reason || rej.details?.return_reason || '-'}&rdquo;
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Read-Only Instrument Calibration Schedule Table */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="font-bold text-slate-800 text-sm">
                  ตารางรายการเครื่องมือและรอบทวนสอบ (โหมดอ่านอย่างเดียว — Read-only)
                </div>
                <div className="text-xs text-slate-500">
                  รวมทั้งหมด {planItems.length} รายการ
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2.5 px-3">รหัสเครื่องมือ</th>
                      <th className="py-2.5 px-3">ชื่อเครื่องมือ</th>
                      <th className="py-2.5 px-3">หน่วยงานทวนสอบ</th>
                      <th className="py-2.5 px-3">ความถี่</th>
                      {MONTH_LABELS.map((mLabel, idx) => (
                        <th key={mLabel} className="py-2.5 px-1.5 text-center w-10">
                          {idx + 1}
                        </th>
                      ))}
                      <th className="py-2.5 px-3">หมายเหตุ / เหตุผล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {planItems.map((item) => {
                      const planned = item.planned_months || [];
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {item.asset_code}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {item.asset_name}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {item.provider_name}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {item.frequency_label}
                          </td>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                            const isPlanned = planned.includes(m);
                            return (
                              <td key={m} className="py-2 px-1 text-center">
                                {isPlanned ? (
                                  <span
                                    title={`วางแผนเดือน ${m}`}
                                    className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-100 text-indigo-800 font-bold text-[11px]"
                                  >
                                    P
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-slate-600">
                            {item.remarks || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Historical Audit Trail Section */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-3">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                <History size={16} className="text-slate-500" />
                <span>ประวัติการดำเนินการและหลักฐาน (Audit Trail)</span>
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-slate-500">ยังไม่มีประวัติการดำเนินการ</p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {history.map((h) => (
                    <div key={h.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-800">{getActionLabelThai(h.action)}</span>
                        <span className="text-slate-500 ml-2">
                          โดย {h.actor_name || h.actor_id}
                        </span>
                        {(h.details?.comment || h.details?.reason) && (
                          <div className="text-slate-700 font-medium">
                            หมายเหตุ/เหตุผล: &ldquo;{h.details.comment || h.details.reason}&rdquo;
                          </div>
                        )}
                      </div>
                      <div className="text-slate-400 font-mono text-[11px] shrink-0">
                        {formatThaiDateTime(h.at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <PlanWorkflowModal
          modalState={workflowModal}
          onClose={() => setWorkflowModal(null)}
          commentOrReason={workflowComment}
          setCommentOrReason={setWorkflowComment}
          error={workflowError}
          saving={savingWorkflow}
          onConfirm={handleConfirmWorkflowAction}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW 2: VCC TASK INBOX LIST (แสดงงานตามผู้รับผิดชอบและสิทธิ์จริง)
  // เน้นคำถาม 3 ข้อ: งานอะไร? ใครต้องทำ? ต้องทำอะไรต่อ?
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" data-testid="vcc-task-inbox-section">
      {/* Category Filter Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs flex items-center flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const isActive = activeFilter === tab.id;
          const count = tabCounts[tab.id] || 0;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`vcc-inbox-tab-${tab.id}`}
              onClick={() => setActiveFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/70'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                  isActive ? 'bg-indigo-700 text-white' : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Task List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            กำลังตรวจสอบงานที่ได้รับมอบหมาย...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckSquare size={28} className="text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-700">
              ไม่มีรายการงานในหมวด &ldquo;{TABS.find((t) => t.id === activeFilter)?.label}&rdquo;
            </div>
            <p className="text-xs text-slate-500">
              ระบบแสดงเฉพาะงานที่คุณเป็นผู้รับผิดชอบหรือเกี่ยวข้องตามสิทธิ์จริงโดยไม่ต้องตั้งตัวกรองสถานะเอง
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredItems.map(({ plan, roleInfo }) => {
              const isReview = plan.status === 'PENDING_REVIEW';
              const isApprove = plan.status === 'PENDING_APPROVAL';
              const isRejected = plan.status === 'REJECTED';
              const isApproved = plan.status === 'APPROVED';

              // คำถามที่ 1: งานอะไร?
              const taskBadgeLabel = isReview
                ? 'ทบทวนแผนสอบเทียบประจำปี (VCC)'
                : isApprove
                  ? 'อนุมัติแผนสอบเทียบประจำปี (VCC)'
                  : isRejected
                    ? 'ส่งกลับแก้ไขแผนสอบเทียบ (VCC)'
                    : 'อนุมัติแล้ว';

              // คำถามที่ 2: ใครต้องทำ?
              const responsiblePerson = isReview
                ? plan.assigned_reviewer_name || plan.assigned_reviewer_id || `ผู้ทบทวนแผนก ${plan.department}`
                : isApprove
                  ? plan.assigned_approver_name || plan.assigned_approver_id || `ผู้อนุมัติแผนก ${plan.department}`
                  : isRejected
                    ? plan.prepared_by_name || plan.prepared_by || 'ผู้จัดทำแผน'
                    : plan.approved_by_name || plan.approved_by || '-';

              // คำถามที่ 3: ต้องทำอะไรต่อ?
              const nextActionLabel = roleInfo.canReview
                ? 'ตรวจสอบรายการและกดยืนยันการทบทวน'
                : roleInfo.canApprove
                  ? 'พิจารณาและกดอนุมัติแผนประจำปี'
                  : roleInfo.canRevise
                    ? 'แก้ไขแผนตามเหตุผลที่ส่งกลับแล้วส่งทบทวนอีกครั้ง'
                    : isApproved
                      ? 'ดำเนินการเสร็จสมบูรณ์ พร้อมออกใบสั่งงาน'
                      : `กำลังรอ ${responsiblePerson} ดำเนินการ`;

              return (
                <div
                  key={plan.id}
                  data-testid={`vcc-inbox-item-${plan.id}`}
                  className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold border ${
                          isReview
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : isApprove
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : isRejected
                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {taskBadgeLabel}
                      </span>

                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {plan.document_code} Rev.{plan.revision}
                      </span>

                      <span className="text-xs font-semibold text-slate-700">
                        ปี {plan.plan_year} · แผนก {plan.department}
                      </span>
                    </div>

                    <div className="text-sm font-bold text-slate-900">
                      {plan.title}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        <strong className="text-slate-700">ผู้จัดทำ:</strong>{' '}
                        {plan.prepared_by_name || plan.prepared_by || '-'}
                      </span>
                      <span>
                        <strong className="text-slate-700">ผู้รับผิดชอบปัจจุบัน:</strong>{' '}
                        <span className="font-semibold text-indigo-700">{responsiblePerson}</span>
                      </span>
                      <span>
                        <strong className="text-slate-700">สิ่งที่ต้องทำต่อ:</strong> {nextActionLabel}
                      </span>
                    </div>

                    {isRejected && plan.rejected_reason && (
                      <div className="mt-1 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium">
                        <strong>เหตุผลที่ส่งกลับ:</strong> {plan.rejected_reason}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      type="button"
                      data-testid={`vcc-inbox-open-${plan.id}`}
                      onClick={() => handleOpenTaskItem(plan, roleInfo)}
                      className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs ${
                        roleInfo.isMyActionable
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {roleInfo.canReview ? (
                        <>
                          <Eye size={14} />
                          <span>เปิดหน้าทบทวนแผน</span>
                        </>
                      ) : roleInfo.canApprove ? (
                        <>
                          <ShieldCheck size={14} />
                          <span>เปิดหน้าอนุมัติแผน</span>
                        </>
                      ) : roleInfo.canRevise ? (
                        <>
                          <FileEdit size={14} />
                          <span>แก้ไขแผนประจำปี</span>
                        </>
                      ) : (
                        <>
                          <Eye size={14} />
                          <span>ดูรายละเอียดงาน</span>
                        </>
                      )}
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VccTaskInboxSection;

