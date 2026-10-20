import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { 
  AlertCircle, Clock, CheckCircle, FileText, Activity, 
  Search, Briefcase, Copy,
  FilterX, Trash2, Edit, ClipboardCheck, Eye, AlertTriangle,
  Printer
} from 'lucide-react';
import EmptyState from '../../../../shared/components/EmptyState';
import { isActionableTask, isLevel6Plus, isReceiptTask } from '../../utils/taskFilter';
import { isDarDraft, isDarRequester, formatDarDocumentDisplay } from '../../utils/darHelper';
import { DarStatusBadge } from '../../components/ui/StatusBadge';
import DashboardHeader from './components/DashboardHeader';
import { isMyDepartment } from '../../services/darService';

const Dashboard = () => {
  const navigate = useNavigate();
  const { 
    currentUser, 
    tasks, 
    dars, 
    documents,
    controlledCopyInstances,
    masterUsers, 
    simulatedDate, 
    simulateNextDay,
    deleteDar
  } = useStore();
  
  // States for Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [activeCardFilter, setActiveCardFilter] = useState('');
  const [activeOverviewTab, setActiveOverviewTab] = useState('ALL_REQUESTS'); // Tabs for System Overview

  const isAdmin = Boolean(currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN' || currentUser?.isDccAdmin);
  const isQmrApprover = Boolean(currentUser?.isQmr || currentUser?.role === 'QMR' || (currentUser?.position && currentUser.position.toUpperCase().includes('QMR')) || (currentUser?.level >= 6 && !currentUser?.isDcc));

  const allDocs = useMemo(() => [...(documents || [])], [documents]);
  const effectiveToday = useMemo(() => {
    return simulatedDate ? new Date(simulatedDate) : new Date();
  }, [simulatedDate]);

  // 1. Calculate Stats (Split into Group 1 and Group 2)
  const isMyTask = (t) => {
    if (!t) return false;
    if (t.status === 'COMPLETED' || t.status === 'REJECTED' || t.status === 'RESOLVED' || t.is_completed === true) return false;
    if (isLevel6Plus(currentUser) && isReceiptTask(t)) return false;
    return isActionableTask(t, currentUser, allDocs, effectiveToday);
  };

  const myTasks = (tasks || []).filter(t => isMyTask(t));

  // Strict Draft Isolation & Role-based Data Scoping
  const scopedDars = (dars || []).filter((dar) => {
    // 1. Strict Draft Isolation: Drafts can ONLY ever be viewed by their creator/requester
    if (isDarDraft(dar)) {
      return isDarRequester(dar, currentUser);
    }

    // 2. DCC Supervisor / Admin: Shows all submitted DAR requests organization-wide
    if (isAdmin) {
      return true;
    }

    // 3. GM / QMR / Approver:
    //    - Actionable items (tasks awaiting review/approval)
    //    - Completed/approved requests organization-wide
    //    - Requests submitted by approver/QMR directly
    if (isQmrApprover) {
      const isActionableForApprover = myTasks.some(t => t.darId === dar.id);
      const isCompletedOrgWide = ['APPROVED_WAITING_EFFECTIVE', 'WAITING_EFFECTIVE', 'EFFECTIVE', 'COMPLETED', 'OBSOLETE'].includes(dar.status);
      const isRequestedByApprover = isDarRequester(dar, currentUser);
      return isActionableForApprover || isCompletedOrgWide || isRequestedByApprover;
    }

    // 4. General Employee / Dept Head:
    //    - Requests created by user
    //    - Requests within user's department
    //    - Tasks assigned to user to review/action
    const isMyRequest = isDarRequester(dar, currentUser);
    const isMyDept = isMyDepartment(dar.department || dar.dept || dar.owner_dept || dar.docNo || dar.code, currentUser);
    const hasMyTask = myTasks.some(t => t.darId === dar.id);
    return isMyRequest || isMyDept || hasMyTask;
  });

  // Tab 1: Group 1: Scoped Requests Stats
  const myDraftCount = scopedDars.filter(d => isDarDraft(d)).length;
  const myInProgressCount = scopedDars.filter(d => ['UNDER_REVIEW', 'PENDING_APPROVAL', 'WAITING_ACKNOWLEDGEMENT', 'IN_PROGRESS'].includes(d.status)).length;
  const myReturnedCount = scopedDars.filter(d => d.status === 'RETURNED_FOR_REVISION').length;
  const myWaitingCount = scopedDars.filter(d => ['WAITING_EFFECTIVE', 'APPROVED_WAITING_EFFECTIVE', 'EFFECTIVE'].includes(d.status)).length;
  const myCancelledCount = scopedDars.filter(d => ['CANCELLED_OVERDUE', 'CANCELLED'].includes(d.status)).length;

  // Tab 2: Group 2: Action Required (งานที่ต้องจัดการ)
  const actionReviewTasks = myTasks.filter(t => t.type === 'Review');
  const actionApproveTasks = myTasks.filter(t => t.type === 'Approve' || t.type === 'CC_REPLACEMENT_APPROVAL');
  
  const actionReviewCount = isAdmin 
    ? (dars || []).filter(d => d.status === 'UNDER_REVIEW').length 
    : actionReviewTasks.length;
    
  const actionApproveCount = isAdmin 
    ? (dars || []).filter(d => d.status === 'PENDING_APPROVAL').length + (tasks || []).filter(t => t.type === 'CC_REPLACEMENT_APPROVAL').length
    : actionApproveTasks.length;
    
  const actionDueSoonCount = myTasks.filter(t => t.status === 'DUE_SOON').length;
  const actionOverdueCount = myTasks.filter(t => t.status === 'OVERDUE').length;

  // Tab 3: DCC Document Control Counts
  const pendingPrintCount = (controlledCopyInstances || []).filter(i => i.status === 'PENDING_ISSUE' || i.status === 'PENDING_RECEIPT').length;
  const pendingRecallCount = (controlledCopyInstances || []).filter(i => {
    const doc = (documents || []).find(d => d.id === (i.doc_id || i.docId));
    return (i.status === 'PENDING_RECALL' || i.status === 'DAMAGED_PENDING_RECALL' || i.status === 'SUPERSEDED_PENDING_RECALL' || i.status === 'OBSOLETE_PENDING_RECALL') || (doc && (doc.status === 'SUPERSEDED_ARCHIVED' || doc.status === 'OBSOLETE' || doc.status === 'OBSOLETE_ARCHIVED') && (i.status === 'ACTIVE' || i.status === 'ISSUED_ACTIVE'));
  }).length;
  const replacementRequestCount = (controlledCopyInstances || []).filter(i => i.status === 'REPLACEMENT_REQUESTED').length;

  // 2. Recent DARs Filtering Logic (Enforcing Universal Draft Privacy & Role Scoping)
  let recentDars = [...scopedDars];

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    recentDars = recentDars.filter(d => 
      (d.id || '').toLowerCase().includes(term) ||
      (d.title || '').toLowerCase().includes(term) ||
      (d.department || '').toLowerCase().includes(term) ||
      (d.darNumber || d.dar_no || d.darNo || '').toLowerCase().includes(term)
    );
  }

  if (activeCardFilter) {
    if (activeCardFilter === 'MY_DRAFT') {
      recentDars = recentDars.filter(d => isDarDraft(d) && isDarRequester(d, currentUser));
    } else if (activeCardFilter === 'MY_IN_PROGRESS') {
      recentDars = recentDars.filter(d => ['UNDER_REVIEW', 'PENDING_APPROVAL', 'WAITING_ACKNOWLEDGEMENT', 'IN_PROGRESS'].includes(d.status));
    } else if (activeCardFilter === 'MY_RETURNED') {
      recentDars = recentDars.filter(d => d.status === 'RETURNED_FOR_REVISION');
    } else if (activeCardFilter === 'MY_WAITING') {
      recentDars = recentDars.filter(d => ['WAITING_EFFECTIVE', 'APPROVED_WAITING_EFFECTIVE', 'EFFECTIVE'].includes(d.status));
    } else if (activeCardFilter === 'MY_CANCELLED') {
      recentDars = recentDars.filter(d => ['CANCELLED_OVERDUE', 'CANCELLED'].includes(d.status));
    } else if (activeCardFilter === 'ACTION_REVIEW') {
      const matchingDarIds = isAdmin ? (dars || []).filter(d => d.status === 'UNDER_REVIEW').map(d => d.id) : actionReviewTasks.map(t => t.darId);
      recentDars = recentDars.filter(d => matchingDarIds.includes(d.id));
    } else if (activeCardFilter === 'ACTION_APPROVE') {
      const matchingDarIds = isAdmin ? (dars || []).filter(d => d.status === 'PENDING_APPROVAL').map(d => d.id) : actionApproveTasks.map(t => t.darId);
      recentDars = recentDars.filter(d => matchingDarIds.includes(d.id));
    } else if (activeCardFilter === 'ACTION_DUE_SOON') {
      const matchingDarIds = isAdmin ? (tasks || []).filter(t => t.status === 'DUE_SOON').map(t => t.darId) : myTasks.filter(t => t.status === 'DUE_SOON').map(t => t.darId);
      recentDars = recentDars.filter(d => matchingDarIds.includes(d.id));
    } else if (activeCardFilter === 'ACTION_OVERDUE') {
      const matchingDarIds = isAdmin ? (tasks || []).filter(t => t.status === 'OVERDUE').map(t => t.darId) : myTasks.filter(t => t.status === 'OVERDUE').map(t => t.darId);
      recentDars = recentDars.filter(d => matchingDarIds.includes(d.id));
    } else if (activeCardFilter === 'DCC_PENDING') {
      recentDars = recentDars.filter(d => ['APPROVED_WAITING_EFFECTIVE', 'WAITING_EFFECTIVE'].includes(d.status));
    }
  }

  // Inject CC_REPLACEMENT_APPROVAL tasks into the table if viewing ALL or ACTION_APPROVE
  if (!activeCardFilter || activeCardFilter === 'ACTION_APPROVE') {
    const replacementTasks = (tasks || []).filter(t => t.type === 'CC_REPLACEMENT_APPROVAL' && isMyTask(t));
    const formattedReplacements = replacementTasks.map(t => {
      const inst = (controlledCopyInstances || []).find(i => i.id === t.instanceId);
      return {
        isTask: true,
        id: inst ? inst.ccNumber : t.id,
        taskId: t.id,
        title: t.title,
        type: 'REPLACEMENT',
        department: inst ? inst.department : '',
        status: t.status,
        date: t.dueDate,
        requesterId: inst ? inst.reportRequesterId : ''
      };
    });
    
    let validMocks = formattedReplacements;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      validMocks = validMocks.filter(d => (d.id || '').toLowerCase().includes(term) || (d.title || '').toLowerCase().includes(term));
    }
    recentDars = [...recentDars, ...validMocks];
  }

  const availableDarTypes = [...new Set(recentDars.map(d => d.type))].filter(Boolean).sort();

  if (filterType) {
    recentDars = recentDars.filter(d => d.type === filterType);
  }
  
  // Multi-tier sort comparator: 1. Timestamp descending (createdAt, submittedAt, date), 2. Numeric DAR ID descending
  const extractDarNumber = (darStr = '') => {
    const match = String(darStr || '').match(/\d+/g);
    return match ? parseInt(match.join(''), 10) : 0;
  };

  recentDars.sort((a, b) => {
    // 1. เปรียบเทียบจาก Timestamp ละเอียดระดับวินาที (createdAt หรือ submittedAt หรือ date)
    const timeA = new Date(a.createdAt || a.submittedAt || a.date || a.request_date || 0).getTime();
    const timeB = new Date(b.createdAt || b.submittedAt || b.date || b.request_date || 0).getTime();

    if (timeB !== timeA) {
      return timeB - timeA; // มากไปน้อย (ใหม่สุดขึ้นก่อน)
    }

    // 2. Secondary Sort: หาก Timestamp เท่ากันหรือไม่มี ให้สกัดตัวเลขจากรหัส DAR เช่น DAR-2026-005 -> 2026005
    const darNumA = extractDarNumber(a.darNo || a.darNumber || a.dar_no || a.id);
    const darNumB = extractDarNumber(b.darNo || b.darNumber || b.dar_no || b.id);

    return darNumB - darNumA; // ตัวเลขมาก (ใบใหม่) ขึ้นก่อน
  });

  recentDars = recentDars.slice(0, 10);

  const getCurrentHandler = (dar) => {
    if (!dar) return '-';
    if (dar.status === 'DRAFT') {
      const user = (masterUsers || []).find(u => u && u.id === dar.requesterId);
      return <span className="text-slate-600 font-semibold">{user ? user.name : (dar.requesterId || '-')} (ผู้ร้องขอ)</span>;
    } else if (dar.status === 'APPROVED_WAITING_EFFECTIVE' || dar.status === 'WAITING_EFFECTIVE') {
      return <span className="text-slate-400 font-medium">-</span>;
    } else if (dar.status === 'UNDER_REVIEW' || dar.status === 'PENDING_APPROVAL' || dar.status === 'WAITING_ACKNOWLEDGEMENT') {
      const activeTasks = (tasks || []).filter(t => t && t.darId === dar.id);
      if (activeTasks.length > 0) {
        const handlerNames = activeTasks.map(t => {
           const user = (masterUsers || []).find(u => u && u.id === t.assigneeId);
           const role = t.type === 'Review' ? 'ผู้ทบทวน' : t.type === 'Approve' ? 'ผู้อนุมัติ' : 'ผู้รับทราบ';
           return user ? `${user.name} (${role})` : (t.assigneeId || 'ผู้รับผิดชอบ');
        });
        return <span className="text-slate-900 font-bold">{handlerNames.join(', ')}</span>;
      }
      return '-';
    } else if (dar.status === 'RETURNED_FOR_REVISION') {
      const user = (masterUsers || []).find(u => u && u.id === dar.requesterId);
      return <span className="text-rose-600 font-bold">{user ? user.name : (dar.requesterId || '-')} (ผู้ร้องขอ - แก้ไข)</span>;
    }
    return '-';
  };

  const isDraftDar = (dar) => isDarDraft(dar);

  const renderActionButtons = (dar) => {
    if (!dar) return null;
    if (dar.isTask) {
      return (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/tasks/approve-replacement/${dar.taskId}`);
          }}
          className="p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-all active:scale-90 cursor-pointer"
          title="ดำเนินการอนุมัติ"
        >
          <ClipboardCheck size={18} />
        </button>
      );
    }
    
    const canManageDraft = isDarRequester(dar, currentUser);
    const activeTask = (tasks || []).find(t => t && t.darId === dar.id && isMyTask(t));
    
    if (isDraftDar(dar) && canManageDraft) {
      return (
        <div className="flex items-center gap-1 justify-center">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const basePath = (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') ? '/dcc/dar/new/document' : 
                              (dar.type === 'REVISION' || dar.type === 'REVISE') ? '/dcc/dar/new/revision' : 
                              '/dcc/dar/new/obsolete';
              navigate(`${basePath}?draftId=${encodeURIComponent(dar.id)}`, {
                state: { draftId: dar.id, draftData: dar }
              });
            }}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all active:scale-90 cursor-pointer"
            title="แก้ไขต่อ (Resume Draft)"
          >
            <Edit size={16} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (typeof window !== 'undefined' && window.confirm('คุณต้องการลบแบบร่างนี้ทิ้งใช่หรือไม่?')) {
                deleteDar(dar.id);
              }
            }}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all active:scale-90 cursor-pointer"
            title="ลบทิ้ง"
          >
            <Trash2 size={16} />
          </button>
        </div>
      );
    }
    
    if (activeTask) {
      const taskRoute = activeTask.type === 'Review' ? `/tasks/review/${activeTask.id}` : 
                        activeTask.type === 'Approve' ? `/tasks/approve/${activeTask.id}` : `/tasks/ack/${activeTask.id}`;
      return (
        <button 
          onClick={() => navigate(taskRoute)}
          className="p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-all active:scale-90 cursor-pointer"
          title="ดำเนินการ"
        >
          <ClipboardCheck size={18} />
        </button>
      );
    }

    if (isAdmin && (dar.status === 'APPROVED_WAITING_EFFECTIVE' || dar.status === 'WAITING_EFFECTIVE')) {
      return (
        <button 
          onClick={() => navigate(`/tasks`)}
          className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all active:scale-90 cursor-pointer"
          title="ดำเนินการ DCC"
        >
          <ClipboardCheck size={18} />
        </button>
      );
    }

    if (dar.status === 'RETURNED_FOR_REVISION' && isDarRequester(dar, currentUser)) {
      return (
        <button 
          onClick={() => navigate(`/tasks/revise/${dar.id}`)}
          className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all active:scale-90 cursor-pointer"
          title="แก้ไขคำขอ"
        >
          <Edit size={16} />
        </button>
      );
    }

    return (
      <button 
        onClick={() => navigate(`/dar/${dar.id}`)}
        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all active:scale-90 cursor-pointer"
        title="ดูรายละเอียด"
      >
        <Eye size={18} />
      </button>
    );
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12 w-full max-w-full overflow-hidden">
      
      {/* ========================================================================= */}
      {/* SECTION 1: COMPACT SINGLE-ROW HERO BAR (<= 48px)                          */}
      {/* ========================================================================= */}
      <DashboardHeader 
        simulatedDate={simulatedDate}
        simulateNextDay={simulateNextDay}
      />

      {/* ========================================================================= */}
      {/* SECTION 2: COMPACT KPI STRIP & TABS                                      */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        
        {/* Modern Segmented Navigation Tabs */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
            {isAdmin ? (
              <>
                <button
                  onClick={() => { setActiveOverviewTab('ALL_REQUESTS'); setActiveCardFilter(''); }}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeOverviewTab === 'ALL_REQUESTS' 
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Briefcase size={13} className={activeOverviewTab === 'ALL_REQUESTS' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>ภาพรวมระบบ</span>
                </button>
                <button
                  onClick={() => { setActiveOverviewTab('DOC_CONTROL'); setActiveCardFilter(''); }}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeOverviewTab === 'DOC_CONTROL' 
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Copy size={13} className={activeOverviewTab === 'DOC_CONTROL' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>งานควบคุมเอกสาร</span>
                  {(pendingPrintCount + pendingRecallCount + replacementRequestCount) > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-semibold px-1.5 py-0.2 rounded-full font-mono">
                      {pendingPrintCount + pendingRecallCount + replacementRequestCount}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setActiveOverviewTab('ALL_REQUESTS'); setActiveCardFilter(''); }}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeOverviewTab === 'ALL_REQUESTS' 
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Briefcase size={13} className={activeOverviewTab === 'ALL_REQUESTS' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>คำขอของฉัน</span>
                </button>
                <button
                  onClick={() => { setActiveOverviewTab('ACTION_REQUIRED'); setActiveCardFilter(''); }}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${currentUser?.level <= 3 ? 'opacity-50 cursor-not-allowed' : ''} ${
                    activeOverviewTab === 'ACTION_REQUIRED' 
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                  disabled={currentUser?.level <= 3}
                >
                  <Activity size={13} className={activeOverviewTab === 'ACTION_REQUIRED' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>งานที่ต้องจัดการ</span>
                  {myTasks.length > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-semibold px-1.5 py-0.2 rounded-full font-mono">
                      {myTasks.length}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>

          {activeCardFilter && (
            <button
              onClick={() => setActiveCardFilter('')}
              className="h-8 px-2.5 text-xs font-medium text-sky-700 hover:text-sky-800 flex items-center gap-1.5 cursor-pointer bg-sky-50 rounded-lg border border-sky-200 transition-colors"
            >
              <FilterX size={13} />
              <span>ล้างตัวกรองสถานะ</span>
            </button>
          )}
        </div>

        {/* Tab 1: Refined KPI Stat Cards 5-Tile Strip */}
        {activeOverviewTab === 'ALL_REQUESTS' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            
            {/* Tile 1: Draft */}
            <div 
              onClick={() => setActiveCardFilter(activeCardFilter === 'MY_DRAFT' ? '' : 'MY_DRAFT')} 
              className={`rounded-xl p-4 border transition-all group cursor-pointer flex flex-col justify-between shadow-2xs ${
                activeCardFilter === 'MY_DRAFT' 
                  ? 'border-slate-400 ring-1 ring-slate-400/20 bg-slate-50' 
                  : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-slate-600">ฉบับร่าง</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600">
                  <Edit size={15} />
                </div>
              </div>
              <div className="flex items-baseline mt-3">
                <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight leading-none">
                  {myDraftCount}
                </span>
                <span className="text-xs font-normal text-slate-400 ml-1.5">ฉบับ</span>
              </div>
            </div>

            {/* Tile 2: In Progress */}
            <div 
              onClick={() => setActiveCardFilter(activeCardFilter === 'MY_IN_PROGRESS' ? '' : 'MY_IN_PROGRESS')} 
              className={`rounded-xl p-4 border transition-all group cursor-pointer flex flex-col justify-between shadow-2xs ${
                activeCardFilter === 'MY_IN_PROGRESS' 
                  ? 'border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/50' 
                  : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-slate-600">กำลังดำเนินการ</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
                  <Clock size={15} />
                </div>
              </div>
              <div className="flex items-baseline mt-3">
                <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight leading-none">
                  {myInProgressCount}
                </span>
                <span className="text-xs font-normal text-slate-400 ml-1.5">ฉบับ</span>
              </div>
            </div>

            {/* Tile 3: Returned for Revision */}
            <div 
              onClick={() => setActiveCardFilter(activeCardFilter === 'MY_RETURNED' ? '' : 'MY_RETURNED')} 
              className={`rounded-xl p-4 border transition-all group cursor-pointer flex flex-col justify-between shadow-2xs ${
                activeCardFilter === 'MY_RETURNED' 
                  ? 'border-amber-500 ring-1 ring-amber-500/20 bg-amber-50/50' 
                  : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-slate-600">ส่งกลับแก้ไข</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600">
                  <AlertCircle size={15} />
                </div>
              </div>
              <div className="flex items-baseline mt-3">
                <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight leading-none">
                  {myReturnedCount}
                </span>
                <span className="text-xs font-normal text-slate-400 ml-1.5">ฉบับ</span>
              </div>
            </div>

            {/* Tile 4: Waiting Effective */}
            <div 
              onClick={() => setActiveCardFilter(activeCardFilter === 'MY_WAITING' ? '' : 'MY_WAITING')} 
              className={`rounded-xl p-4 border transition-all group cursor-pointer flex flex-col justify-between shadow-2xs ${
                activeCardFilter === 'MY_WAITING' 
                  ? 'border-emerald-500 ring-1 ring-emerald-500/20 bg-emerald-50/50' 
                  : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-slate-600">รอประกาศใช้</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600">
                  <CheckCircle size={15} />
                </div>
              </div>
              <div className="flex items-baseline mt-3">
                <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight leading-none">
                  {myWaitingCount}
                </span>
                <span className="text-xs font-normal text-slate-400 ml-1.5">ฉบับ</span>
              </div>
            </div>

            {/* Tile 5: Cancelled / Overdue */}
            <div 
              onClick={() => setActiveCardFilter(activeCardFilter === 'MY_CANCELLED' ? '' : 'MY_CANCELLED')} 
              className={`rounded-xl p-4 border transition-all group cursor-pointer flex flex-col justify-between shadow-2xs ${
                activeCardFilter === 'MY_CANCELLED' 
                  ? 'border-rose-500 ring-1 ring-rose-500/20 bg-rose-50/50' 
                  : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-slate-600">ยกเลิก</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-50 text-rose-600">
                  <Trash2 size={15} />
                </div>
              </div>
              <div className="flex items-baseline mt-3">
                <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight leading-none">
                  {myCancelledCount}
                </span>
                <span className="text-xs font-normal text-slate-400 ml-1.5">ฉบับ</span>
              </div>
            </div>

          </div>
        )}

        {/* Tab 2: Sleek Micro-Metrics 4-Tile Strip (Action Required) */}
        {(!isAdmin && activeOverviewTab === 'ACTION_REQUIRED') && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            
            {/* Tile 1: Review */}
            <div 
              onClick={() => setActiveCardFilter(activeCardFilter === 'ACTION_REVIEW' ? '' : 'ACTION_REVIEW')} 
              className={`rounded-xl px-3.5 py-2.5 border transition-all group cursor-pointer flex flex-col justify-between min-h-[66px] shadow-2xs ${
                activeCardFilter === 'ACTION_REVIEW' 
                  ? 'border-sky-500 ring-1 ring-sky-500/20 bg-sky-50/50' 
                  : 'border-slate-200/80 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">รอการทบทวน</span>
                <Clock size={14} className="text-sky-500" />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl sm:text-2xl font-bold text-sky-700 font-mono tracking-tight leading-none">
                  {actionReviewCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">รายการ</span>
              </div>
            </div>

            {/* Tile 2: Approve */}
            <div 
              onClick={() => setActiveCardFilter(activeCardFilter === 'ACTION_APPROVE' ? '' : 'ACTION_APPROVE')} 
              className={`rounded-xl px-3.5 py-2.5 border transition-all group cursor-pointer flex flex-col justify-between min-h-[66px] shadow-2xs ${
                activeCardFilter === 'ACTION_APPROVE' 
                  ? 'border-indigo-400 ring-1 ring-indigo-400/20 bg-indigo-50/50' 
                  : 'border-slate-200/80 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">รอการอนุมัติ</span>
                <CheckCircle size={14} className="text-indigo-500" />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl sm:text-2xl font-bold text-indigo-700 font-mono tracking-tight leading-none">
                  {actionApproveCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">รายการ</span>
              </div>
            </div>

            {/* Tile 3: Due Soon */}
            <div 
              onClick={() => setActiveCardFilter(activeCardFilter === 'ACTION_DUE_SOON' ? '' : 'ACTION_DUE_SOON')} 
              className={`rounded-xl px-3.5 py-2.5 border transition-all group cursor-pointer flex flex-col justify-between min-h-[66px] shadow-2xs ${
                activeCardFilter === 'ACTION_DUE_SOON' 
                  ? 'border-amber-400 ring-1 ring-amber-400/20 bg-amber-50/50' 
                  : 'border-slate-200/80 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">ใกล้ครบกำหนด</span>
                <Clock size={14} className="text-amber-500" />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl sm:text-2xl font-bold text-amber-700 font-mono tracking-tight leading-none">
                  {actionDueSoonCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">รายการ</span>
              </div>
            </div>

            {/* Tile 4: Overdue */}
            <div 
              onClick={() => setActiveCardFilter(activeCardFilter === 'ACTION_OVERDUE' ? '' : 'ACTION_OVERDUE')} 
              className={`rounded-xl px-3.5 py-2.5 border transition-all group cursor-pointer flex flex-col justify-between min-h-[66px] shadow-2xs ${
                activeCardFilter === 'ACTION_OVERDUE' 
                  ? 'border-rose-400 ring-1 ring-rose-400/20 bg-rose-50/50' 
                  : 'border-slate-200/80 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">เกินกำหนด</span>
                <AlertTriangle size={14} className="text-rose-500" />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl sm:text-2xl font-bold text-rose-700 font-mono tracking-tight leading-none">
                  {actionOverdueCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">รายการ</span>
              </div>
            </div>

          </div>
        )}

        {/* Tab 3: DCC Doc Control 3-Tile Strip */}
        {isAdmin && activeOverviewTab === 'DOC_CONTROL' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            
            {/* Tile 1: Pending Print */}
            <div 
              onClick={() => navigate('/controlled-copy?tab=PENDING_ISSUE')}
              className="rounded-xl px-3.5 py-2.5 border border-slate-200/80 bg-white hover:border-slate-300 transition-all group cursor-pointer flex flex-col justify-between min-h-[66px] shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">รอพิมพ์แจกจ่าย</span>
                <Printer size={14} className="text-sky-600" />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tracking-tight leading-none">
                  {pendingPrintCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">เล่ม</span>
              </div>
            </div>

            {/* Tile 2: Pending Recall */}
            <div 
              onClick={() => navigate('/controlled-copy?tab=RECALL_CHECKLIST')}
              className="rounded-xl px-3.5 py-2.5 border border-slate-200/80 bg-white hover:border-slate-300 transition-all group cursor-pointer flex flex-col justify-between min-h-[66px] shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">รอเรียกคืน</span>
                <Clock size={14} className="text-amber-500" />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tracking-tight leading-none">
                  {pendingRecallCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">เล่ม</span>
              </div>
            </div>

            {/* Tile 3: Replacement Requests */}
            <div 
              onClick={() => navigate('/tasks')}
              className="rounded-xl px-3.5 py-2.5 border border-slate-200/80 bg-white hover:border-slate-300 transition-all group cursor-pointer flex flex-col justify-between min-h-[66px] shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">คำขอทดแทน</span>
                <AlertTriangle size={14} className="text-rose-500" />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl sm:text-2xl font-bold text-rose-700 font-mono tracking-tight leading-none">
                  {replacementRequestCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">คำขอ</span>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: ACTIVITY STREAM LEDGER (HIGH-DENSITY RECENT DARS TABLE)         */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs">
        
        {/* Compact Single-Row Table Toolbar */}
        <div className="p-3 border-b border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="text-sky-600 shrink-0" size={16} />
            <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
              {activeOverviewTab === 'DOC_CONTROL' ? 'รายการงานควบคุมสำเนาและแจกจ่าย' : 'คำร้อง DAR ล่าสุด'}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
              {recentDars.length} รายการ
            </span>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input 
                type="text"
                placeholder="ค้นหา DAR No, ชื่อเอกสาร..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-8 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-sky-500 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              disabled={availableDarTypes.length === 0}
              className="h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-700 cursor-pointer"
            >
              <option value="">ทุกประเภท</option>
              {availableDarTypes.map(t => (
                <option key={t} value={t}>
                  {t === 'NEW' ? 'จัดทำใหม่' : t === 'REVISION' ? 'ขอแก้ไข' : t === 'OBSOLETE' ? 'ขอยกเลิก' : t}
                </option>
              ))}
            </select>

            {(searchTerm || filterType || activeCardFilter) && (
              <button 
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('');
                  setActiveCardFilter('');
                }}
                title="ล้างตัวกรอง"
                className="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <FilterX size={14} />
              </button>
            )}
          </div>
        </div>

        {/* High-Density Data Table */}
        <div className="overflow-x-auto w-full max-w-full">
          {recentDars.length > 0 ? (
            <table className="w-full text-left text-sm border-collapse min-w-[960px]">
              <thead className="bg-slate-50 text-slate-500 font-semibold text-[12px] uppercase tracking-wider border-b border-slate-200 whitespace-nowrap sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-4 w-16 text-center select-none bg-slate-50">จัดการ</th>
                  <th className="py-2.5 px-4 w-36 font-mono select-none bg-slate-50">เลขที่ DAR</th>
                  <th className="py-2.5 px-4 min-w-[220px] select-none bg-slate-50">ชื่อเอกสาร / หัวข้อ</th>
                  <th className="py-2.5 px-4 w-28 select-none bg-slate-50">ประเภท</th>
                  {isAdmin && <th className="py-2.5 px-4 w-20 select-none bg-slate-50">แผนก</th>}
                  <th className="py-2.5 px-4 w-32 select-none bg-slate-50">สถานะ</th>
                  <th className="py-2.5 px-4 w-44 select-none bg-slate-50">ผู้รับผิดชอบปัจจุบัน</th>
                  <th className="py-2.5 px-4 w-28 text-right font-mono select-none bg-slate-50">วันที่ยื่น</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {recentDars.map((dar) => (
                  <tr 
                    key={dar.id} 
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    onClick={() => {
                      if (dar.isTask) {
                        navigate(`/tasks/approve-replacement/${dar.taskId}`);
                      } else if (isDraftDar(dar)) {
                        const basePath = (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') ? '/dcc/dar/new/document' : 
                                        (dar.type === 'REVISION' || dar.type === 'REVISE') ? '/dcc/dar/new/revision' : 
                                        '/dcc/dar/new/obsolete';
                        navigate(`${basePath}?draftId=${encodeURIComponent(dar.id)}`, {
                          state: { draftId: dar.id, draftData: dar }
                        });
                      } else {
                        navigate(`/dar/${dar.id}`);
                      }
                    }}
                  >
                    <td className="py-3 px-4 text-center">
                      {renderActionButtons(dar)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isDraftDar(dar) ? (
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            const basePath = (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') ? '/dcc/dar/new/document' : 
                                            (dar.type === 'REVISION' || dar.type === 'REVISE') ? '/dcc/dar/new/revision' : 
                                            '/dcc/dar/new/obsolete';
                            navigate(`${basePath}?draftId=${encodeURIComponent(dar.id)}`, {
                              state: { draftId: dar.id, draftData: dar }
                            });
                          }}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 cursor-pointer transition-colors"
                          title="คลิกเพื่อแก้ไขแบบร่างต่อ"
                        >
                          ฉบับร่าง (Draft)
                        </span>
                      ) : (
                        <span 
                          className="text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200/80 inline-block font-mono font-semibold text-xs hover:underline cursor-pointer transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (dar.isTask) {
                              navigate(`/tasks/approve-replacement/${dar.taskId}`);
                            } else {
                              navigate(`/dar/${dar.id}`);
                            }
                          }}
                        >
                          {dar.darNumber || dar.dar_no || dar.darNo || (isDarDraft(dar) ? 'ฉบับร่าง (Draft)' : (dar.id || '-'))}
                        </span>
                      )}
                    </td>
                    {/* คอลัมน์ ชื่อเอกสาร / หัวข้อ */}
                    <td className="py-3 px-4 align-middle min-w-0">
                      {(() => {
                        const { docCode, docTitle } = formatDarDocumentDisplay(dar, documents);
                        return (
                          <div className="flex flex-col min-w-0">
                            {/* บรรทัดที่ 1: รหัสเอกสาร */}
                            <span className="text-[13px] sm:text-sm font-semibold text-slate-800 leading-tight group-hover:text-sky-600 transition-colors">
                              {docCode}
                            </span>
                            {/* บรรทัดที่ 2: ชื่อเอกสารจริง (ตัด tag [OBSOLETE] ออกถ้ามีหลงเหลือ) */}
                            <span 
                              className="text-xs text-slate-500 line-clamp-1 leading-normal mt-0.5" 
                              title={docTitle}
                            >
                              {docTitle}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono text-[11px] font-medium uppercase tracking-wider border border-slate-200">
                        {({'NEW': 'จัดทำใหม่', 'NEW_DOCUMENT': 'จัดทำใหม่', 'REVISION': 'ขอแก้ไข', 'REVISE': 'ขอแก้ไข', 'OBSOLETE': 'ขอยกเลิก', 'REPLACEMENT': 'ขอสำเนาทดแทน'})[dar.type] || dar.type || '-'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs whitespace-nowrap">
                        {dar.department || '-'}
                      </td>
                    )}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <DarStatusBadge status={dar.status} />
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap min-w-0 truncate text-[13px] font-medium">
                      {dar.isTask ? 'ผู้จัดการแผนก' : getCurrentHandler(dar)}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-right font-mono text-xs whitespace-nowrap">
                      {dar.date || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 flex items-center justify-center">
              <EmptyState />
            </div>
          )}
        </div>

      </div>

    </div>
  );
};

export default Dashboard;
