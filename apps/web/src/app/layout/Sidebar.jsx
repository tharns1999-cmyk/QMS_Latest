import React, { useState, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import useStore, { isNotificationVisibleToUser, isNotificationReadByUser } from '../../store/useStore';
import { 
  Home, 
  Inbox, 
  BookOpen, 
  FilePlus2, 
  FileText, 
  Globe, 
  FolderGit2, 
  CalendarDays, 
  Files, 
  SlidersHorizontal, 
  History, 
  Sparkles, 
  RotateCcw, 
  Trash2, 
  CheckCircle2, 
  X,
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Calendar,
  Wrench
} from 'lucide-react';
import toast from 'react-hot-toast';
import NotificationPopover from './NotificationPopover';
import { isActionableTask, isAssignedToSomeoneElse, isDccAdmin as checkDccAdmin, isSameDepartment } from '../../modules/dcc/utils/taskFilter';
import { evaluateDocumentReviewStatus } from '../../modules/dcc/utils/documentUtils';
import { extractDeptCode } from '../../modules/dcc/services/darService';
import SystemTimeSimulatorWidget from '../../modules/dcc/components/common/SystemTimeSimulatorWidget';
import { isApiMode } from '../../api/client';
import { logout } from '../../api/session';
import { createPortal } from 'react-dom';
import ChangePasswordForm from '../auth/ChangePasswordForm';
import { syncVccTasks } from '../../modules/vcc/api/vccPlanApi';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    currentUser, requestUsers, reviewUsers, approveUsers, tasks, controlledCopyInstances, documents, 
    externalDocuments, periodicReviewSchedules,
    masterUsers, setCurrentUser, switchUser, notifications,
    resetTransactionDataToCleanSlate, manualSeedData, externalRequests,
    simulatedSystemDate, getEffectiveToday
  } = useStore();
  
  const [isCleanSlateOpen, setIsCleanSlateOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  const path = location.pathname;
  // Context-aware Hub & Spoke: DCC module routes
  const isDccModule = path.startsWith('/dcc') || 
                      path.startsWith('/dar') || 
                      path.startsWith('/tasks') || 
                      path.startsWith('/library') || 
                      path.startsWith('/controlled-copy') || 
                      path.startsWith('/external') || 
                      path.startsWith('/periodic-reviews') || 
                      path.startsWith('/dashboard') || 
                      path.startsWith('/documents') || 
                      path.startsWith('/viewer');

  // Context-aware Hub & Spoke: VCC module routes
  const isVccModule = path.startsWith('/vcc');

  const isRequester = Boolean(
    currentUser?.status !== 'INACTIVE' && (
      currentUser?.canCreateDar !== false ||
      currentUser?.permissions?.includes('DAR_CREATE') ||
      currentUser?.isWorkflowUser ||
      (requestUsers || []).some(u => u.id === currentUser?.id || u.empId === currentUser?.id || u.id === currentUser?.empId)
    )
  );

  const isReviewerOrApprover = Boolean(
    currentUser?.canAccessTasks !== false && (
      currentUser?.canAccessTasks ||
      currentUser?.permissions?.includes('TASK_ACCESS') ||
      currentUser?.isWorkflowUser ||
      Number(currentUser?.approval_level || currentUser?.level || 0) >= 1 ||
      (reviewUsers || []).some(u => u.id === currentUser?.id || u.empId === currentUser?.id || u.id === currentUser?.empId) ||
      (approveUsers || []).some(u => u.id === currentUser?.id || u.empId === currentUser?.id || u.id === currentUser?.empId)
    )
  );

  const isDccUser = Boolean(currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN' || currentUser?.role === 'DCC_STAFF');
  const isDccAdmin = checkDccAdmin(currentUser);
  const isAdmin = isDccAdmin;

  const effectiveToday = getEffectiveToday ? getEffectiveToday() : (simulatedSystemDate ? new Date(simulatedSystemDate) : new Date());
  const allDocs = useMemo(() => [...(documents || []), ...(externalDocuments || [])], [documents, externalDocuments]);

  // Sync VCC workflow tasks on mount and when currentUser changes
  useEffect(() => {
    syncVccTasks(currentUser).catch(() => {});
  }, [currentUser]);

  // Task Counts Calculations
  const userTasks = (tasks || []).filter(t => isActionableTask(t, currentUser, allDocs, effectiveToday) && !isAssignedToSomeoneElse(t, currentUser));
  const myTaskCount = userTasks.filter(t => t.actionRequired !== false && !t.is_completed && t.status !== 'COMPLETED').length;

  const vccTaskCount = useMemo(() => {
    return userTasks.filter(t => {
      const normType = String(t.type || t.taskType || '').toUpperCase();
      return (
        t.referenceType === 'VCC_PLAN' ||
        normType.startsWith('VCC_PLAN_') ||
        Boolean(t.planId) ||
        normType.startsWith('VCC_')
      );
    }).length;
  }, [userTasks]);

  const ccTaskCount = (controlledCopyInstances || []).filter(inst => {
    const doc = (documents || []).find(d => d.id === (inst.doc_id || inst.docId));
    const isRecall = doc && (doc.status === 'SUPERSEDED_ARCHIVED' || doc.status === 'OBSOLETE' || doc.status === 'OBSOLETE_ARCHIVED') && (inst.status === 'ACTIVE' || inst.status === 'ISSUED_ACTIVE');
    return (inst.status === 'PENDING_RECEIPT' || inst.status === 'PENDING_ISSUE' || inst.status === 'DISPATCHED_PENDING_RECEIPT' || inst.status === 'REPLACEMENT_REQUESTED' || inst.status === 'PENDING_RECALL' || isRecall);
  }).length;

  const periodicReviewCount = useMemo(() => {
    const refDate = getEffectiveToday ? getEffectiveToday() : (simulatedSystemDate ? new Date(simulatedSystemDate) : new Date());
    const activeDocs = [...(documents || []), ...(externalDocuments || [])].filter(doc => {
      if (!doc) return false;
      const statusUpper = String(doc.status || '').toUpperCase();
      if (statusUpper !== 'ACTIVE' && statusUpper !== 'EFFECTIVE') return false;
      if (doc.is_superseded || doc.is_obsolete || doc.isSuperseded || doc.isObsolete) return false;
      return true;
    });

    const explicitManagedDepts = Array.isArray(currentUser?.managedDepartments)
      ? currentUser.managedDepartments.filter(d => d && d !== '*')
      : [];
    const userDeptList = [
      currentUser?.department,
      currentUser?.dept,
      currentUser?.primary_department,
      ...(currentUser?.depts || []),
      ...explicitManagedDepts
    ].filter(Boolean);

    const seenDocKeys = new Set();
    return activeDocs.filter(doc => {
      const docCode = String(doc.edCode || doc.doc_code || doc.code || doc.document_number || doc.docNo || doc.title || doc.id || '').trim();
      const matchedSchedule = (periodicReviewSchedules || []).find(s =>
        s.isActive !== false && (
          (doc.id && (s.documentId === doc.id || s.externalDocumentId === doc.id)) ||
          (docCode && s.documentNumber === docCode)
        )
      );

      const docDept = doc.department || doc.owner_dept || doc.dept || matchedSchedule?.ownerDepartmentId || extractDeptCode(docCode);
      const hasDeptAccess = userDeptList.some(uDept => isSameDepartment(docDept, uDept));
      if (!hasDeptAccess) return false;

      if (docCode && seenDocKeys.has(docCode)) return false;

      // 1. ตรวจสอบว่าอยู่ระหว่างรออนุมัติหรือไม่ (ไม่นับเป็นงานต้องทำ)
      const isPending =
        doc.review_status === 'PENDING_APPROVAL' ||
        doc.status === 'PENDING_APPROVAL' ||
        matchedSchedule?.status === 'PENDING_APPROVAL' ||
        Boolean(doc.pending_periodic_review);
      if (isPending) return false;

      // 2. ตรวจสอบว่าดำเนินการเสร็จสิ้นในรอบนี้แล้วหรือไม่
      const isCompleted =
        doc.review_status === 'COMPLETED' ||
        matchedSchedule?.status === 'COMPLETED' ||
        doc.is_reviewed_this_cycle ||
        matchedSchedule?.is_reviewed_this_cycle;
      if (isCompleted) return false;

      const isExt = Boolean(doc.is_external || doc.external || doc.doc_type === 'EXTERNAL' || doc.edCode || String(docCode).startsWith('ED-'));
      const nextDate = isExt
        ? (doc.nextReviewDate || doc.next_review_date || matchedSchedule?.nextReviewDate || matchedSchedule?.next_review_date || matchedSchedule?.currentScheduledReviewDate)
        : (doc.next_review_date || doc.nextReviewDate || matchedSchedule?.next_review_date || matchedSchedule?.nextReviewDate || matchedSchedule?.currentScheduledReviewDate);
      if (!nextDate) return false;

      const docToEval = {
        ...doc,
        ...(matchedSchedule || {}),
        nextReviewDate: nextDate,
        next_review_date: nextDate
      };
      const evalResult = evaluateDocumentReviewStatus(docToEval, refDate);
      const evalStatus = typeof evalResult === 'object' ? evalResult.status : evalResult;
      if (evalStatus === 'COMPLETED') return false;

      const targetDate = new Date(nextDate);
      if (isNaN(targetDate.getTime())) return false;
      targetDate.setHours(0, 0, 0, 0);
      const today0 = new Date(refDate);
      today0.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((targetDate.getTime() - today0.getTime()) / (1000 * 60 * 60 * 24));

      // Strictly DUE_SOON (0 <= diffDays <= 30) or OVERDUE (diffDays < 0)
      if (diffDays > 30) return false;
      if (evalStatus !== 'OVERDUE' && evalStatus !== 'DUE_SOON') return false;

      if (docCode) seenDocKeys.add(docCode);
      return true;
    }).length;
  }, [documents, externalDocuments, periodicReviewSchedules, currentUser, simulatedSystemDate, getEffectiveToday]);

  const myExternalReviseCount = useMemo(() => {
    const reviseDocIds = new Set();
    (tasks || []).forEach(t => {
      if (
        (t.type === 'EXTERNAL_REVISE' || t.taskType === 'EXTERNAL_REVISE') &&
        (t.assigneeId === currentUser?.id || t.requesterId === currentUser?.id) &&
        t.status === 'PENDING'
      ) {
        reviseDocIds.add(t.referenceId || t.docId || t.id);
      }
    });
    (externalRequests || []).forEach(r => {
      if (r.requesterId === currentUser?.id && r.status === 'REVISE_REQUESTED') {
        reviseDocIds.add(r.docId || r.externalDocId || r.requestId || r.id);
      }
    });
    return reviseDocIds.size;
  }, [tasks, externalRequests, currentUser]);

  // Unread notifications count
  const unreadNotificationCount = useMemo(() => {
    return (notifications || [])
      .filter(n => isNotificationVisibleToUser(n, currentUser))
      .filter(n => !isNotificationReadByUser(n, currentUser?.id)).length;
  }, [notifications, currentUser]);

  const SectionHeader = ({ title }) => (
    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 pt-4 pb-1 select-none">
      {title}
    </div>
  );

  const NavItem = ({ 
    to, 
    icon: IconComponent, 
    label, 
    badgeCount, 
    badgeColor = 'blue', 
    pulsePing = false,
    end = false 
  }) => (
    <NavLink 
      to={to} 
      end={end}
      className={({ isActive }) => 
        `group relative flex items-center justify-between px-3 py-2 text-xs rounded-xl font-medium gap-2.5 transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 ${
          isActive 
            ? 'bg-blue-50 text-blue-700 font-semibold shadow-2xs' 
            : 'text-slate-600 hover:text-slate-900 bg-transparent hover:bg-slate-50'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Subtle Active Indicator Bar */}
          {isActive && (
            <span 
              aria-hidden="true"
              className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-blue-600 transition-all" 
            />
          )}

          <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-0.5">
            <IconComponent 
              className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                isActive 
                  ? 'text-blue-600' 
                  : 'text-slate-400 group-hover:text-slate-600'
              }`} 
              strokeWidth={1.5} 
            />
            <span className="truncate leading-normal tracking-tight text-[13px]">{label}</span>
          </div>

          {badgeCount > 0 && (
            <div className="relative shrink-0 flex items-center justify-center">
              {/* Layer 1: Sonar Ping Aura for attention-grabbing when pulsePing is active */}
              {pulsePing && (
                <span 
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-amber-400 opacity-60 animate-ping pointer-events-none"
                />
              )}
              {/* Layer 2: Interactive Core Badge */}
              <span 
                className={`relative text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full shrink-0 transition-all duration-200 group-hover:scale-110 ${
                  badgeColor === 'red'
                    ? 'bg-rose-500 text-white shadow-2xs'
                    : badgeColor === 'amber'
                      ? pulsePing
                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/50 ring-1 ring-amber-400/40 animate-pulse'
                        : 'bg-amber-500 text-white shadow-2xs'
                      : isActive 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                }`}
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            </div>
          )}
        </>
      )}
    </NavLink>
  );

  return (
    <aside className="w-64 sm:w-[264px] h-screen flex flex-col justify-between overflow-hidden bg-white border-r border-slate-200/80 select-none shrink-0 z-30 shadow-none">
      {/* ================= TOP BRAND HEADER & NOTIFICATION WIDGET ================= */}
      <div className="p-3.5 pb-2 shrink-0 border-b border-slate-100 space-y-1">
        <div 
          onClick={() => navigate('/portal')}
          className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-50 transition-all duration-150 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          title="ไปยังหน้าหลักพอร์ทัล"
        >
          <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0 group-hover:scale-105 transition-transform">
            Q
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-[15px] font-black text-slate-900 tracking-tight leading-tight truncate">
                QMS
              </h1>
              <span className="px-1.5 py-0.2 text-[9px] font-black font-mono bg-blue-50 text-blue-700 border border-blue-200 rounded shrink-0 uppercase tracking-wider">
                {isVccModule ? 'VCC' : isDccModule ? 'DCC' : 'Portal'}
              </span>
            </div>
            <p className="text-[10.5px] text-slate-500 font-medium tracking-tight truncate mt-0.5">
              {isVccModule ? 'Calibration & Verification' : 'Enterprise Quality Suite'}
            </p>
          </div>
        </div>

        {/* Top Notification Trigger Widget */}
        <NotificationPopover unreadCount={unreadNotificationCount} />
      </div>

      {/* ================= CENTER SECTION: Grouped Navigation Links ================= */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {/* WORKSPACE NAVIGATION (Hub vs Spoke) */}
        <SectionHeader title="WORKSPACE" />
        {(!isDccModule && !isVccModule) ? (
          <NavItem 
            to="/portal" 
            end
            icon={Home} 
            label="ภาพรวมพอร์ทัล" 
          />
        ) : (
          <NavItem 
            to="/portal" 
            end
            icon={ArrowLeft} 
            label="กลับสู่พอร์ทัลหลัก" 
          />
        )}

        {/* DCC MODULE NAVIGATION (Shown only when active in DCC module route) */}
        {isDccModule && (
          <>
            {isReviewerOrApprover && (
              <NavItem 
                to="/dcc/tasks" 
                icon={Inbox} 
                label="กล่องงานที่ต้องทำ" 
                badgeCount={myTaskCount}
                badgeColor={myTaskCount > 0 ? 'amber' : 'blue'}
                pulsePing={myTaskCount > 0}
              />
            )}

            {/* DCC MANAGEMENT (งานกำกับดูแล DCC - แสดงเฉพาะ Role DCC / Admin): first, so the admin never has to scroll for it */}
            {(isDccUser || isAdmin) && (
              <>
                <SectionHeader title="งานกำกับดูแล DCC" />
                <NavItem 
                  to="/dcc/controlled-copy" 
                  icon={Files} 
                  label="ทะเบียนสำเนาควบคุม" 
                  badgeCount={ccTaskCount}
                  badgeColor="blue"
                />
                {isAdmin && (
                  <>
                    <NavItem 
                      to="/dcc/admin/master-data" 
                      icon={SlidersHorizontal} 
                      label="จัดการข้อมูลหลัก" 
                    />
                    <NavItem 
                      to="/dcc/admin/action-log" 
                      icon={History} 
                      label="ประวัติการดำเนินการ (Audit Trail)" 
                    />
                  </>
                )}
              </>
            )}

            {/* GROUP 2: INTERNAL DOCS / DAR (เอกสารภายใน) */}
            <SectionHeader title="เอกสารภายใน" />
            <NavItem 
              to="/dcc/library" 
              icon={BookOpen} 
              label="คลังเอกสารแม่บท" 
            />
            {isRequester && (
              <>
                <NavItem 
                  to="/dcc/dar/new" 
                  icon={FilePlus2} 
                  label="ยื่นคำร้อง DAR" 
                />
                <NavItem 
                  to="/dcc/dar/list" 
                  icon={FileText} 
                  label="ติดตามคำร้องของฉัน" 
                />
              </>
            )}

            {/* GROUP 3: EXTERNAL DOCS / EDR (เอกสารภายนอก) */}
            <SectionHeader title="เอกสารภายนอก" />
            <NavItem 
              to="/dcc/external-docs" 
              icon={Globe} 
              label="คลังเอกสารภายนอก" 
            />
            <NavItem 
              to="/dcc/external/my-requests" 
              icon={FolderGit2} 
              label="คำร้องของฉัน" 
              badgeCount={myExternalReviseCount}
              badgeColor="amber"
            />
            <NavItem 
              to="/dcc/periodic-reviews" 
              icon={CalendarDays} 
              label="การทบทวนตามรอบ" 
              badgeCount={periodicReviewCount}
              badgeColor="amber"
            />
          </>
        )}

        {/* VCC MODULE NAVIGATION (Shown only when active in VCC module route) */}
        {isVccModule && (
          <>
            <SectionHeader title="กล่องงาน" />
            <NavItem
              to="/vcc/tasks"
              icon={Inbox}
              label="งานที่ต้องดำเนินการ"
              badgeCount={vccTaskCount}
              badgeColor="amber"
              pulsePing={vccTaskCount > 0}
            />

            <SectionHeader title="การปฏิบัติงานและภาพรวม" />
            <NavItem
              to="/vcc/dashboard"
              icon={BarChart3}
              label="ภาพรวมและแจ้งเตือน"
            />
            <NavItem
              to="/vcc/work-orders"
              icon={ClipboardList}
              label="ใบสั่งงานและบันทึกผล"
            />

            <SectionHeader title="แผนและการควบคุม" />
            <NavItem
              to="/vcc/plans"
              icon={Calendar}
              label="แผนการทวนสอบประจำปี"
            />

            <SectionHeader title="ทะเบียนและข้อมูลหลัก" />
            <NavItem
              to="/vcc/assets"
              icon={Wrench}
              label="ทะเบียนเครื่องมือวัด"
            />
          </>
        )}
      </nav>

      {/* ================= BOTTOM SECTION: Dev Tools & User Profile ================= */}
      <div className="p-3 border-t border-slate-200/80 bg-white shrink-0 space-y-2.5">
        {/* Compact Dev Action Bar (QA Seed / Clean Slate) - Admins only; it loads and wipes demo data in this browser, so not when connected to the server */}
        {isAdmin && !isApiMode && (
          <div className="flex items-center justify-between gap-1.5 py-1 px-2 bg-slate-50 border border-slate-200/60 rounded-lg text-[11px] text-slate-500">
            <span className="font-mono text-[10px] font-medium text-slate-400 uppercase tracking-wider pl-1">
              DEV TOOLS
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  manualSeedData();
                  toast?.success?.('โหลดชุดข้อมูลตัวอย่างสำเร็จ');
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition-colors font-medium cursor-pointer"
                title="โหลดชุดข้อมูลตัวอย่าง (Manual Seed)"
              >
                <Sparkles size={11} className="text-blue-600 shrink-0" />
                <span>🔀 Seed</span>
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setIsCleanSlateOpen(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-rose-50 text-slate-600 hover:text-rose-700 transition-colors font-medium cursor-pointer"
                title="ล้างข้อมูลจำลองทั้งหมดเพื่อเริ่มทดสอบใหม่"
              >
                <RotateCcw size={11} className="text-rose-600 shrink-0" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        )}

        {/* Global System Time Simulator Widget - demo only: connected to the server, its dates decide, and this widget would just mislead */}
        {!isApiMode && <SystemTimeSimulatorWidget />}

        {/* User Profile & Role Switcher */}
        <div className="p-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl space-y-2.5 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-200 shrink-0">
              {currentUser?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-xs font-semibold text-slate-900 leading-snug truncate tracking-tight">
                  {currentUser?.name}
                </p>
                {currentUser?.isDcc && (
                  <span className="px-1.5 py-0.2 text-[9px] font-semibold font-mono bg-blue-50 text-blue-700 rounded border border-blue-200 shrink-0 uppercase tracking-wider">
                    DCC
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5 font-mono">
                {currentUser?.position || currentUser?.department || 'Staff'} • L{currentUser?.level || 1}
              </p>
            </div>
          </div>

          {isApiMode ? (
            <div className="space-y-1.5">
              <button type="button" onClick={() => setChangingPassword(true)}
                className="w-full h-8 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                เปลี่ยนรหัสผ่าน
              </button>
              <button type="button" onClick={logout}
                className="w-full h-8 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                ออกจากระบบ
              </button>
              {changingPassword && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
                  <ChangePasswordForm onDone={() => { setChangingPassword(false); toast.success('เปลี่ยนรหัสผ่านเรียบร้อย'); }} onCancel={() => setChangingPassword(false)} />
                </div>,
                document.body
              )}
            </div>
          ) : (
          <div className="relative">
            <select
              className="w-full h-8 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer leading-normal shadow-none"
              value={currentUser?.id || ''}
              onChange={(e) => {
                const fn = switchUser || setCurrentUser;
                fn(e.target.value);
              }}
              title="สลับผู้ใช้งาน / บทบาทจำลอง"
            >
              {(masterUsers || []).map(user => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.department}) L{user.level}
                </option>
              ))}
            </select>
          </div>
          )}
        </div>
      </div>

      {/* ================= CLEAN SLATE RESET MODAL ================= */}
      {isCleanSlateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200/80 shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base tracking-tight leading-snug">ล้างข้อมูลจำลองเพื่อเริ่มต้นใหม่</h3>
                  <p className="text-xs text-slate-500 mt-0.5">รีเซ็ตข้อมูลธุรกรรมเพื่อการทดสอบระบบใหม่</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCleanSlateOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-600 leading-relaxed flex-1 overflow-y-auto">
              <p className="text-sm text-slate-800 font-medium">
                การดำเนินการนี้จะ <strong>ลบข้อมูลจำลองเชิงธุรกรรมทั้งหมด</strong> เพื่อให้ระบบกลับสู่สภาพเริ่มต้นสำหรับการทดสอบตั้งแต่ต้น:
              </p>

              <div className="p-4 bg-white border border-rose-200/80 rounded-xl space-y-2 shadow-2xs">
                <div className="font-bold text-rose-700 flex items-center gap-2 text-xs">
                  <Trash2 size={14} strokeWidth={1.5} className="text-rose-600 shrink-0" />
                  <span>ข้อมูลที่จะถูกล้างเป็นค่าว่าง:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1 font-medium text-xs">
                  <li>คำร้อง DAR ทั้งหมด</li>
                  <li>เอกสารในคลังและเอกสารแม่บท</li>
                  <li>ทะเบียนสำเนาควบคุมทั้งหมด</li>
                  <li>กล่องงานและการแจ้งเตือนทั้งหมด</li>
                  <li>ประวัติการทำงานและ Audit Trail ทั้งหมด</li>
                  <li>บันทึกการทบทวนตามรอบ</li>
                </ul>
              </div>

              <div className="p-4 bg-white border border-emerald-200/80 rounded-xl space-y-2 shadow-2xs">
                <div className="font-bold text-emerald-700 flex items-center gap-2 text-xs">
                  <CheckCircle2 size={14} strokeWidth={1.5} className="text-emerald-600 shrink-0" />
                  <span>ข้อมูลหลักที่ยังคงไว้ (Master Data):</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1 font-medium text-xs">
                  <li>บัญชีผู้ใช้มาตรฐาน พร้อมรหัส PIN 123456</li>
                  <li>แผนกมาตรฐาน (PD, QA/QC, WH, EN ฯลฯ)</li>
                  <li>ประเภทเอกสาร (QM, QP, SOP, WI, FM, SD, ED)</li>
                  <li>จุดใช้งานและสถานีมาตรฐานประจำโรงงาน</li>
                  <li>การตั้งค่าความปลอดภัย e-Signature และ SLAs</li>
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsCleanSlateOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  resetTransactionDataToCleanSlate();
                  setIsCleanSlateOpen(false);
                  toast.success('ล้างข้อมูล Mock Data ทั้งหมดเรียบร้อยแล้ว ระบบพร้อมสำหรับการทดสอบ Clean Slate');
                }}
                className="px-4.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-[0.98] rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                <RotateCcw size={14} />
                <span>ยืนยันล้างข้อมูล</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
