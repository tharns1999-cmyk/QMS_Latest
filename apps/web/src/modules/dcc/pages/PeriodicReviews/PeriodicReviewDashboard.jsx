import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Check,
  FileText,
  Search,
  Filter,
  RotateCw,
  RotateCcw,
  History,
  X,
  ExternalLink,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileEdit,
  Ban
} from 'lucide-react';
import useStore from '../../../../store/useStore';
import { getVisiblePeriodicReviews, normalizePeriodicReviewRecord, canExportPeriodicReviews, getPositionLevelForDepartment } from '../../services/PeriodicReviewAccessService';
import { getDueState, getReviewStatusLabel, getReviewOutcomeLabel } from '../../services/PeriodicReviewService';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import { formatQmsDisplayDate } from '../../../../shared/utils/dateFormatter';
import { isDocumentReviewedThisCycle, evaluateDocumentReviewStatus, getPeriodicReviewStatus } from '../../utils/documentUtils';
import { isSameDepartment } from '../../utils/taskFilter';
import { extractDeptCode } from '../../services/darService';
import { PeriodicReviewAuditCard } from '../../components/workflow/PeriodicReviewHistoryTab';
import PeriodicReviewApprovalModal from '../Tasks/PeriodicReviewApprovalModal';
import { canFastTrackExternalReview, minReviewApproverLevel } from '../../store/periodicReviewSlice';

// KPI bucket by due date: pending/awaiting rows of this cycle still count as DUE_SOON/OVERDUE so the cards add up to the total
const getKpiBucket = (r, today) => {
  const ev = evaluateDocumentReviewStatus(r, today);
  const st = typeof ev === 'object' ? ev.status : ev;
  const hasDue = Boolean(r.nextReviewDate || r.next_review_date || r.currentScheduledReviewDate || r.targetDoc?.nextReviewDate || r.targetDoc?.next_review_date);
  if ((st === 'PENDING_APPROVAL' || st === 'AWAITING_ACTION') && hasDue && ev.diffDays <= 30) {
    return ev.diffDays < 0 ? 'OVERDUE' : 'DUE_SOON';
  }
  return st;
};

const formatPeriodicDocVersion = (record, targetDoc, isExternalTab = false) => {
  const isExt = Boolean(
    isExternalTab ||
    record?.isExternal ||
    record?.documentCategory === 'EXTERNAL' ||
    record?.externalDocumentId ||
    targetDoc?.is_external ||
    targetDoc?.external ||
    targetDoc?.doc_type === 'EXTERNAL' ||
    targetDoc?.edCode ||
    String(record?.documentNumber || '').startsWith('ED-')
  );
  if (isExt) {
    const editionVal =
      targetDoc?.sourceVersion ||
      targetDoc?.source_version ||
      targetDoc?.edition ||
      targetDoc?.version ||
      record?.edition ||
      record?.sourceVersion ||
      record?.source_version ||
      record?.version ||
      (record?.rev && !/^(Rev\.?\s*)?0*$/i.test(String(record.rev).trim()) ? record.rev : '') ||
      '-';
    const cleanEd = String(editionVal).trim().replace(/^(Edition|Rev\.?)\s*/i, '');
    return cleanEd && cleanEd !== '-' ? `Edition ${cleanEd}` : 'Edition -';
  }
  const rawRev = record?.rev || targetDoc?.revision || targetDoc?.rev || targetDoc?.revNo || '00';
  const cleanRev = String(rawRev).trim().replace(/^(Rev\.?\s*)+/i, '');
  if (!cleanRev) return '-';
  return `Rev.${cleanRev}`;
};

const DashboardCard = ({ title, sublabel, value, icon: Icon, colorClass, onClick, active }) => (
  <div
    onClick={onClick}
    className={`card-surface p-5 cursor-pointer transition-all relative overflow-hidden group ${
      active ? 'ring-2 ring-[#0D99FF]/30 border-sky-400 bg-[#E5F4FF]/30 shadow-xs' : 'hover:border-[#E5E5E5]'
    }`}
  >
    <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${colorClass} opacity-10 rounded-bl-full`} />
    <div className="flex items-start justify-between">
      <div className="min-w-0 pr-2">
        <p className="text-xs font-bold text-[#666666] mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-[#1E1E1E] font-mono">{value}</h3>
        {sublabel && (
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {Array.isArray(sublabel) ? (
              sublabel.map((s, idx) => <span key={idx} className="inline mr-1">{s}</span>)
            ) : (
              <span>{sublabel}</span>
            )}
          </div>
        )}
      </div>
      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${colorClass} text-white shadow-xs group-hover:scale-105 transition-transform shrink-0`}>
        <Icon size={18} />
      </div>
    </div>
  </div>
);

const getStatusBadgeConfig = (status, _hasActiveTask, isPendingApproval, isReviewed) => {
  if (status === 'REJECTED') {
    return {
      label: '⚠️ ถูกตีกลับแก้ไข',
      cls: 'bg-orange-50 text-orange-800 border-orange-200'
    };
  }
  if (isReviewed || status === 'COMPLETED') {
    return {
      label: '✔️ ทบทวนแล้วเสร็จ',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
  }
  if (status === 'REVISION_REQUIRED' || status === 'AWAITING_ACTION') {
    return {
      label: '⚠️ รออัปเดตฉบับใหม่',
      cls: 'bg-amber-50 text-amber-800 border-amber-200'
    };
  }
  if (status === 'OBSOLETE_REQUIRED') {
    return {
      label: '🚫 รอขอยกเลิก',
      cls: 'bg-rose-50 text-rose-700 border-rose-200'
    };
  }
  if (status === 'PENDING_APPROVAL' || isPendingApproval) {
    return {
      label: '⏳ รออนุมัติผล',
      cls: 'bg-sky-50 text-sky-800 border-sky-200'
    };
  }
  if (status === 'OVERDUE') {
    return {
      label: '🚨 เกินกำหนด',
      cls: 'bg-rose-50 text-rose-700 border-rose-200'
    };
  }
  if (status === 'DUE_SOON' || status === 'DUE') {
    return {
      label: '⚠️ ใกล้ครบกำหนด',
      cls: 'bg-amber-50 text-amber-700 border-amber-200'
    };
  }
  return {
    label: '✅ ยังไม่ถึงกำหนด',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };
};

const ReviewHistoryModal = ({ isOpen, onClose, record, doc, effectiveToday, onNavigateRecord }) => {
  const isReviewedThisCycle = isDocumentReviewedThisCycle(record, effectiveToday) || (doc && isDocumentReviewedThisCycle(doc, effectiveToday));
  const reviewHistory = useMemo(() => {
    const list = [];
    if (doc?.periodic_reviews && Array.isArray(doc.periodic_reviews) && doc.periodic_reviews.length > 0) {
      list.push(...doc.periodic_reviews);
    } else if (doc?.review_history && Array.isArray(doc.review_history) && doc.review_history.length > 0) {
      list.push(...doc.review_history);
    } else if (record?.reviewLogs && Array.isArray(record.reviewLogs)) {
      list.push(...record.reviewLogs);
    }
    return list;
  }, [doc, record]);

  if (!isOpen || !record) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
        <div className="px-6 py-4 bg-white border-b border-[#E5E5E5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#E5F4FF] text-[#0D99FF] rounded-xl">
              <History size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1E1E1E]">
                ประวัติการทบทวนเอกสาร: {record.documentNumber}
              </h2>
              <p className="text-xs text-[#666666] line-clamp-1">{record.documentName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#888888] hover:text-[#1E1E1E] hover:bg-[#F5F5F5] rounded-xl transition-colors cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5 font-medium">แผนกเจ้าของ</span>
              <span className="font-bold text-slate-800">{record.ownerDepartmentId || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5 font-medium">ฉบับปัจจุบัน</span>
              <span className="font-bold text-slate-800 font-mono">{formatPeriodicDocVersion(record, doc)}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5 font-medium">วันครบกำหนดรอบนี้</span>
              <span className="font-bold text-[#0D99FF] font-mono">{formatQmsDisplayDate(record.nextReviewDate)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              บันทึกผลการทบทวนย้อนหลัง ({reviewHistory.length} รายการ)
            </h3>

            {reviewHistory.length === 0 ? (
              <div className="text-center py-8 px-4 bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-medium text-slate-500">
                  ยังไม่มีประวัติการบันทึกทบทวนย้อนหลังสำหรับเอกสารฉบับนี้
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  รอบทบทวนถัดไปมีกำหนดในวันที่ {formatQmsDisplayDate(record.nextReviewDate)}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {reviewHistory.map((item, idx) => (
                  <PeriodicReviewAuditCard key={item.id || idx} item={item} index={idx} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-[#E5E5E5] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            ปิด
          </button>
          {isReviewedThisCycle ? (
            <button
              disabled
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-400 text-xs font-semibold rounded-xl cursor-not-allowed"
              title="เอกสารผ่านการทบทวนรอบปีนี้เรียบร้อยแล้ว"
            >
              <Check size={13} className="text-emerald-500" />
              <span>ทบทวนแล้ว</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateRecord(doc ? { ...record, targetDoc: doc } : record);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0D99FF] hover:bg-[#007BE5] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              <RotateCw size={13} />
              <span>บันทึกผลการทบทวนรอบนี้</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const UnifiedWorkspaceView = ({ 
  visibleRecords = [], 
  allDocs = [], 
  effectiveToday: propEffectiveToday,
  viewScope = 'MY_DEPT',
  setViewScope,
  selectedDeptFilter = 'ALL',
  setSelectedDeptFilter,
  isManagementOrDcc = false
}) => {
  const navigate = useNavigate();
  const { currentUser, simulatedSystemDate, getEffectiveToday, tasks, approvalMatrix } = useStore();
  const effectiveToday = useMemo(() => {
    return propEffectiveToday || (getEffectiveToday ? getEffectiveToday() : (simulatedSystemDate ? new Date(simulatedSystemDate) : new Date()));
  }, [propEffectiveToday, getEffectiveToday, simulatedSystemDate]);

  const [approvalTaskTarget, setApprovalTaskTarget] = useState(null);
  const [categoryTab, setCategoryTab] = useState('INTERNAL'); // 'INTERNAL' | 'EXTERNAL'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTION_REQUIRED' | 'DUE_SOON' | 'UPCOMING' | 'OVERDUE' | 'COMPLETED'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'next_review_date',
    direction: 'asc' // ค่าเริ่มต้น: ใกล้สุดขึ้นก่อน
  });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // History Modal State
  const [historyTarget, setHistoryTarget] = useState(null);

  const getRecordDept = (r) => r.ownerDepartmentId || r.targetDoc?.department || r.targetDoc?.owner_dept || r.department || extractDeptCode(r.documentNumber);

  // Scoped records based on viewScope and selectedDeptFilter
  const scopedRecords = useMemo(() => {
    return visibleRecords.filter(r => {
      const dept = getRecordDept(r);

      // Non-management: restricted to their department / managed departments
      if (!isManagementOrDcc) {
        const userDept = currentUser?.department || currentUser?.dept || currentUser?.primary_department;
        const permitted = [
          userDept,
          ...(currentUser?.depts || []),
          ...(currentUser?.departments || []),
          ...(currentUser?.affiliated_departments || []),
          ...(Array.isArray(currentUser?.managedDepartments) ? currentUser.managedDepartments.filter(d => d !== '*') : [])
        ].filter(Boolean);
        if (currentUser?.managedDepartments?.includes('*') || currentUser?.isDcc) return true;
        return permitted.some(p => isSameDepartment(dept, p));
      }

      // If user selected "MY_DEPT"
      if (viewScope === 'MY_DEPT') {
        const userDept = currentUser?.department || currentUser?.dept || currentUser?.primary_department;
        return isSameDepartment(dept, userDept);
      }

      // If user selected "ALL" but specified a department in the dropdown
      if (selectedDeptFilter !== 'ALL') {
        return isSameDepartment(dept, selectedDeptFilter);
      }

      // If user selected "ALL" and dropdown is "ALL"
      return true;
    });
  }, [visibleRecords, isManagementOrDcc, viewScope, selectedDeptFilter, currentUser]);

  // Split scoped records into Internal & External categories
  const internalRecords = useMemo(
    () => scopedRecords.filter(r => !r.isExternal),
    [scopedRecords]
  );

  const externalRecords = useMemo(
    () => scopedRecords.filter(r => r.isExternal),
    [scopedRecords]
  );

  const currentCategoryList = useMemo(
    () => (categoryTab === 'INTERNAL' ? internalRecords : externalRecords),
    [categoryTab, internalRecords, externalRecords]
  );

  // Available departments for the user/dropdown
  const availableDepts = useMemo(() => {
    const depts = new Set();
    visibleRecords.forEach(r => {
      const d = getRecordDept(r);
      if (d) depts.add(d);
    });
    if (currentUser?.department) depts.add(currentUser.department);
    return Array.from(depts).filter(Boolean).sort();
  }, [visibleRecords, currentUser]);

  // KPI Metrics computed for the currently selected Category Tab using MECE helper
  const stats = useMemo(() => {
    const s = { total: currentCategoryList.length, dueSoon: 0, overdue: 0, completed: 0, upToDate: 0 };
    currentCategoryList.forEach(r => {
      const b = getKpiBucket(r, effectiveToday);
      if (b === 'OVERDUE') s.overdue++;
      else if (b === 'DUE_SOON') s.dueSoon++;
      else if (b === 'COMPLETED') s.completed++;
      else s.upToDate++;
    });
    return { ...s, actionRequired: s.dueSoon + s.overdue };
  }, [currentCategoryList, effectiveToday]);

  // Filtered records for the Table
  const filteredRecords = useMemo(() => {
    let result = currentCategoryList;

    // Helper to detect active pending workflow states
    const hasPendingReviewWorkflow = (r) => {
      if (r.is_reviewed_this_cycle || r.status === 'COMPLETED' || r.review_status === 'COMPLETED') return false;
      const targetDoc = r.targetDoc || allDocs?.find(d => 
        !d.is_superseded && !d.is_obsolete && d.status !== 'SUPERSEDED' && d.status !== 'OBSOLETE' && (
          (r.documentId && d.id === r.documentId) || 
          (r.externalDocumentId && d.id === r.externalDocumentId) ||
          (r.documentNumber && (d.edCode === r.documentNumber || d.documentNumber === r.documentNumber || d.code === r.documentNumber || d.doc_code === r.documentNumber))
        )
      );
      if (targetDoc?.is_reviewed_this_cycle || targetDoc?.review_status === 'COMPLETED') return false;
      return Boolean(
        r.status === 'PENDING_APPROVAL' || targetDoc?.review_status === 'PENDING_APPROVAL' ||
        r.status === 'AWAITING_ACTION' || targetDoc?.review_status === 'AWAITING_ACTION' ||
        r.status === 'REVISION_REQUIRED' || targetDoc?.review_status === 'REVISION_REQUIRED' ||
        r.status === 'OBSOLETE_REQUIRED' || targetDoc?.review_status === 'OBSOLETE_REQUIRED' ||
        r.outcome === 'REVISION_REQUIRED' || targetDoc?.periodic_review_outcome === 'REVISION_REQUIRED' ||
        r.outcome === 'OBSOLETE_REQUIRED' || targetDoc?.periodic_review_outcome === 'OBSOLETE_REQUIRED'
      );
    };

    // Status filter
    if (statusFilter === 'ACTION_REQUIRED') {
      result = result.filter(r => {
        if (hasPendingReviewWorkflow(r)) return true;
        const ev = evaluateDocumentReviewStatus(r, effectiveToday);
        const st = typeof ev === 'object' ? ev.status : ev;
        return st === 'OVERDUE' || st === 'DUE_SOON';
      });
    } else if (statusFilter === 'DUE_SOON') {
      result = result.filter(r => getKpiBucket(r, effectiveToday) === 'DUE_SOON');
    } else if (statusFilter === 'UPCOMING') {
      result = result.filter(r => {
        if (hasPendingReviewWorkflow(r)) return false;
        const ev = evaluateDocumentReviewStatus(r, effectiveToday);
        const st = typeof ev === 'object' ? ev.status : ev;
        return st === 'UP_TO_DATE' || st === 'NORMAL';
      });
    } else if (statusFilter === 'OVERDUE') {
      result = result.filter(r => getKpiBucket(r, effectiveToday) === 'OVERDUE');
    } else if (statusFilter === 'COMPLETED') {
      result = result.filter(r => {
        const ev = evaluateDocumentReviewStatus(r, effectiveToday);
        const st = typeof ev === 'object' ? ev.status : ev;
        return st === 'COMPLETED';
      });
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(
        r =>
          (r.documentNumber || '').toLowerCase().includes(term) ||
          (r.documentName || '').toLowerCase().includes(term) ||
          (r.ownerDepartmentId || '').toLowerCase().includes(term)
      );
    }

    return result;
  }, [currentCategoryList, statusFilter, searchTerm, effectiveToday, allDocs]);

  const sortedDocuments = useMemo(() => {
    const list = [...filteredRecords];

    list.sort((a, b) => {
      if (sortConfig.key === 'next_review_date') {
        const dateA = a.nextReviewDate || a.next_review_date || a.currentScheduledReviewDate;
        const dateB = b.nextReviewDate || b.next_review_date || b.currentScheduledReviewDate;
        const timeA = dateA ? new Date(dateA).getTime() : null;
        const timeB = dateB ? new Date(dateB).getTime() : null;

        const validTimeA = timeA && !isNaN(timeA) ? timeA : null;
        const validTimeB = timeB && !isNaN(timeB) ? timeB : null;

        // เอกสารที่ไม่มีวันครบกำหนดจะถูกจัดไปอยู่ท้ายสุดของตารางเสมอ
        if (validTimeA === null && validTimeB === null) return 0;
        if (validTimeA === null) return 1;
        if (validTimeB === null) return -1;
        if (validTimeA === validTimeB) return 0;

        return sortConfig.direction === 'asc' ? validTimeA - validTimeB : validTimeB - validTimeA;
      }

      return 0;
    });

    return list;
  }, [filteredRecords, sortConfig]);

  const pagination = useTablePagination(sortedDocuments, 10);

  const handleNavigateRecord = (record, options = {}) => {
    if (!record) return;
    const docId = record.documentId || record.externalDocumentId || record.targetDoc?.id || '';
    const docCode = record.documentNumber || record.targetDoc?.edCode || record.targetDoc?.doc_code || record.targetDoc?.code || record.id || '';
    const isExternal = Boolean(
      record.isExternal ||
      record.documentCategory === 'EXTERNAL' ||
      categoryTab === 'EXTERNAL' ||
      record.externalDocumentId ||
      record.targetDoc?.is_external ||
      record.targetDoc?.edCode ||
      String(docCode).startsWith('ED-')
    );
    const scheduleId = (record.id && !String(record.id).startsWith('PRS-AUTO-'))
      ? record.id
      : (docId || docCode || record.id);
    const hasActiveLinkedRequest = Boolean(
      record.linkedActionId ||
      record.linkedRequestId ||
      record.linked_request_id ||
      record.linkedDraftId ||
      record.targetDoc?.linked_request_id ||
      record.targetDoc?.linkedActionId ||
      record.targetDoc?.linkedRequestId
    );
    const isAwaitingAction = Boolean(
      record.status === 'AWAITING_ACTION' ||
      record.targetDoc?.review_status === 'AWAITING_ACTION'
    );
    const shouldReEvaluate = Boolean(
      options.isReEvaluating ||
      (!hasActiveLinkedRequest && isAwaitingAction)
    );
    const params = new URLSearchParams();
    if (docId) params.set('docId', String(docId));
    if (docCode) params.set('docCode', String(docCode));
    if (isExternal) params.set('isExternal', 'true');
    if (shouldReEvaluate) {
      params.set('isReEvaluating', 'true');
    }
    const queryString = params.toString();
    navigate(
      `/dcc/periodic-reviews/${encodeURIComponent(scheduleId)}${queryString ? `?${queryString}` : ''}`,
      {
        state: {
          record,
          docId,
          docCode,
          isExternal,
          isReEvaluating: shouldReEvaluate
        }
      }
    );
  };

  const handleOpenHistory = (record) => {
    const targetDoc = record.targetDoc || allDocs.find(
      d =>
        d.id === record.documentId ||
        d.id === record.externalDocumentId ||
        d.edCode === record.documentNumber ||
        d.doc_code === record.documentNumber ||
        d.document_number === record.documentNumber ||
        d.title === record.documentNumber
    );
    setHistoryTarget({ record: targetDoc ? { ...record, targetDoc } : record, doc: targetDoc });
  };

  const canUserApprove = (rec, doc) => {
    if (!currentUser) return false;
    // Segregation of duties: the reviewer can never approve their own submission
    const reviewerId = doc?.pendingReview?.reviewer_id || doc?.pending_review_details?.reviewer_id ||
      doc?.pending_periodic_review?.reviewer_id || rec?.pendingReview?.reviewer_id;
    if (reviewerId && String(reviewerId) === String(currentUser.id)) return false;
    if (rec?.documentCategory === 'EXTERNAL' || rec?.isExternal || rec?.externalDocumentId) {
      return canFastTrackExternalReview(currentUser, rec?.ownerDepartmentId || doc?.department || doc?.dept || 'DC', 'ED', approvalMatrix);
    }
    if (
      currentUser.isDcc ||
      currentUser.is_dcc ||
      currentUser.role === 'DCC' ||
      currentUser.role === 'DCC_ADMIN' ||
      currentUser.role === 'DCC_STAFF' ||
      currentUser.role === 'QMR' ||
      currentUser.role === 'ADMIN' ||
      currentUser.role === 'SUPER_ADMIN'
    ) {
      return true;
    }

    const docDept = rec?.ownerDepartmentId || doc?.department || doc?.owner_dept || doc?.dept || extractDeptCode(rec?.documentNumber);
    if (Array.isArray(currentUser.managedDepartments) && currentUser.managedDepartments.includes('*')) {
      return true;
    }

    const deptLevel = getPositionLevelForDepartment(currentUser, docDept);
    const userLevel = Number(currentUser.level || currentUser.approval_level || 0);
    const effectiveLevel = Math.max(deptLevel, userLevel);
    const isHodOrManager = effectiveLevel >= minReviewApproverLevel(rec?.documentNumber || doc?.doc_code || doc?.type, approvalMatrix);

    const userDeptList = [
      currentUser.department,
      currentUser.dept,
      currentUser.primary_department,
      ...(currentUser.depts || []),
      ...(Array.isArray(currentUser.managedDepartments) ? currentUser.managedDepartments : [])
    ].filter(Boolean);

    const isMatchingDept = userDeptList.some(d => isSameDepartment(d, docDept));
    return isHodOrManager && isMatchingDept;
  };

  const handleApproveClick = (record, targetDoc) => {
    const docId = record.documentId || targetDoc?.id || record.externalDocumentId;
    const docCode = record.documentNumber || targetDoc?.edCode || targetDoc?.doc_code;

    const storeState = useStore.getState();
    if (typeof storeState.approveExternalPeriodicReview === 'function') {
      try {
        storeState.approveExternalPeriodicReview(docId || docCode || record.id);
        return;
      } catch {
        // fallback to modal
      }
    }

    const existingTask = (tasks || []).find(t =>
      (t.type === 'PERIODIC_REVIEW_APPROVAL' || t.taskType === 'PERIODIC_REVIEW_APPROVAL') &&
      t.status !== 'COMPLETED' &&
      (
        (docId && (t.docId === docId || t.documentId === docId)) ||
        (docCode && (t.docCode === docCode || t.document_code === docCode || t.documentNumber === docCode)) ||
        (record.id && t.scheduleId === record.id)
      )
    );

    if (existingTask) {
      setApprovalTaskTarget(existingTask);
      return;
    }

    // Synthesize task for PeriodicReviewApprovalModal
    const synthTask = {
      id: targetDoc?.pending_review_task_id || record.pendingApprovalTaskId || `TASK-APPR-${record.id || Date.now()}`,
      type: 'PERIODIC_REVIEW_APPROVAL',
      title: `อนุมัติผลการทบทวนเอกสาร: ${record.documentNumber || record.documentName} (ไม่มีการเปลี่ยนแปลง)`,
      document_code: record.documentNumber,
      document_title: record.documentName,
      docId: docId,
      docCode: record.documentNumber,
      scheduleId: record.id,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      payload: targetDoc?.pending_periodic_review || record.pendingReview || {
        doc_id: docId,
        doc_code: record.documentNumber,
        scheduleId: record.id,
        is_external: record.isExternal,
        reviewer_id: record.ownerUserId || 'Staff',
        details: { comment: 'ทบทวนเอกสารตามรอบ (ไม่มีการเปลี่ยนแปลง)' }
      }
    };

    const currentTasks = storeState.tasks || [];
    if (!currentTasks.some(t => t.id === synthTask.id)) {
      useStore.setState({ tasks: [synthTask, ...currentTasks] });
    }

    setApprovalTaskTarget(synthTask);
  };

  return (
    <div className="space-y-6">
      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardCard
          title="เอกสารทั้งหมด"
          value={stats.total}
          icon={FileText}
          colorClass="from-indigo-500 to-indigo-600"
          onClick={() => setStatusFilter('ALL')}
          active={statusFilter === 'ALL'}
        />
        <DashboardCard
          title="ใกล้ครบกำหนดใน 30 วัน"
          sublabel="ครบกำหนดภายใน 30 วันข้างหน้า"
          value={stats.dueSoon}
          icon={Clock}
          colorClass="from-amber-400 to-orange-500"
          onClick={() => setStatusFilter(statusFilter === 'DUE_SOON' ? 'ALL' : 'DUE_SOON')}
          active={statusFilter === 'DUE_SOON'}
        />
        <DashboardCard
          title="เกินกำหนด"
          sublabel="เลยกำหนดทบทวนแล้ว"
          value={stats.overdue}
          icon={AlertTriangle}
          colorClass="from-rose-500 to-red-600"
          onClick={() => setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
          active={statusFilter === 'OVERDUE'}
        />
        <DashboardCard
          title="ทบทวนแล้วเสร็จ"
          sublabel="ดำเนินการเสร็จสิ้นในรอบนี้"
          value={stats.completed}
          icon={CheckCircle}
          colorClass="from-emerald-500 to-teal-600"
          onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
          active={statusFilter === 'COMPLETED'}
        />
      </div>

      {/* Main Single Workspace Card */}
      <div className="card-surface overflow-hidden flex flex-col min-h-0 border border-slate-200 shadow-sm rounded-xl">
        {/* Category Tabs & Sub-status Filter Bar */}
        <div className="p-3 bg-[#FAFAFA] border-b border-[#E5E5E5] space-y-3">
          {/* Top row: Category Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCategoryTab('INTERNAL');
                  if (setSelectedDeptFilter) setSelectedDeptFilter('ALL');
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  categoryTab === 'INTERNAL'
                    ? 'bg-[#0D99FF] text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <FileText size={16} />
                <span>เอกสารภายใน (Internal)</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    categoryTab === 'INTERNAL' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {internalRecords.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCategoryTab('EXTERNAL');
                  if (setSelectedDeptFilter) setSelectedDeptFilter('ALL');
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  categoryTab === 'EXTERNAL'
                    ? 'bg-[#0D99FF] text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <ExternalLink size={16} />
                <span>เอกสารภายนอก (External)</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    categoryTab === 'EXTERNAL' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {externalRecords.length}
                </span>
              </button>
            </div>
          </div>

          {/* Sub row: Status Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {[
              { id: 'ALL', label: 'ทั้งหมด' },
              { id: 'ACTION_REQUIRED', label: 'ต้องดำเนินการ (Due Soon / Overdue)' },
              { id: 'UPCOMING', label: 'ยังไม่ถึงกำหนด' },
              { id: 'COMPLETED', label: 'ดำเนินการแล้วเสร็จ' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'text-slate-600 bg-white hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Department Filter */}
        <div className="p-3.5 border-b border-[#E5E5E5] flex flex-col sm:flex-row gap-3 justify-between items-center bg-white">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="ค้นหารหัสเอกสาร / ชื่อเอกสาร..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-[#E5E5E5] rounded-xl text-xs focus:outline-none focus:border-[#0D99FF] bg-[#F5F5F5] focus:bg-white transition-all"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto items-center">
            <Filter size={15} className="text-slate-400 hidden sm:block" />
            <select
              aria-label="กรองตามแผนก"
              value={selectedDeptFilter}
              onChange={(e) => {
                const newDept = e.target.value;
                if (setSelectedDeptFilter) {
                  setSelectedDeptFilter(newDept);
                }
                if (newDept === 'ALL' && setViewScope) {
                  setViewScope('ALL');
                } else if (newDept !== currentUser?.department && setViewScope) {
                  setViewScope('ALL');
                }
              }}
              className="border border-[#E5E5E5] rounded-xl text-xs px-3 py-2 w-full sm:w-48 bg-[#F5F5F5] focus:bg-white focus:outline-none focus:border-[#0D99FF] font-medium cursor-pointer"
            >
              <option value="ALL">ทุกแผนก</option>
              {availableDepts.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full max-w-full scrollbar-thin">
          <table className="w-full text-left text-xs table-fixed border-collapse">
            <thead className="table-header sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0] shadow-xs backdrop-blur-xs whitespace-nowrap">
              <tr>
                <th className="px-4 py-3 w-36 font-mono bg-[#F8FAFC]">รหัสเอกสาร</th>
                <th className="px-4 py-3 bg-[#F8FAFC]">ชื่อเอกสาร</th>
                <th className="px-4 py-3 w-24 text-center bg-[#F8FAFC]">แผนก</th>
                <th className="px-4 py-3 w-24 text-center font-mono bg-[#F8FAFC]">ฉบับ (Rev)</th>
                <th
                  scope="col"
                  onClick={() => handleSort('next_review_date')}
                  className="px-4 py-3 w-32 text-center font-mono bg-[#F8FAFC] cursor-pointer select-none hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>ครบกำหนด</span>
                    <span className="text-slate-400 group-hover:text-slate-700">
                      {sortConfig.key === 'next_review_date' ? (
                        sortConfig.direction === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-sky-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-sky-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
                      )}
                    </span>
                  </div>
                </th>
                <th className="px-4 py-3 w-36 text-center bg-[#F8FAFC]">สถานะรอบ</th>
                <th className="px-4 py-3 w-48 text-right bg-[#F8FAFC]">จัดการ (Actions)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {pagination.paginatedData.map(record => {
                const targetDoc = record.targetDoc || allDocs?.find(d => 
                  !d.is_superseded && !d.is_obsolete && d.status !== 'SUPERSEDED' && d.status !== 'OBSOLETE' && (
                    (record.documentId && d.id === record.documentId) || 
                    (record.externalDocumentId && d.id === record.externalDocumentId) ||
                    (record.documentNumber && (d.edCode === record.documentNumber || d.documentNumber === record.documentNumber || d.code === record.documentNumber || d.doc_code === record.documentNumber))
                  )
                );
                const isPendingApproval = Boolean(
                  record.status === 'PENDING_APPROVAL' ||
                  targetDoc?.review_status === 'PENDING_APPROVAL'
                );
                const docToEvaluate = targetDoc
                  ? {
                      ...targetDoc,
                      ...record,
                      nextReviewDate: record.nextReviewDate,
                      next_review_date: record.next_review_date,
                      isExternal: record.isExternal
                    }
                  : record;
                const evaluation = evaluateDocumentReviewStatus(docToEvaluate, effectiveToday);
                const calculatedStatus = typeof evaluation === 'object' ? evaluation.status : evaluation;
                const diffDays = typeof evaluation === 'object' ? evaluation.diffDays : null;
                const isReviewed = calculatedStatus === 'COMPLETED';

                const isCompletedCycle = Boolean(
                  record.is_reviewed_this_cycle ||
                  record.review_status === 'COMPLETED' ||
                  record.status === 'COMPLETED' ||
                  targetDoc?.is_reviewed_this_cycle ||
                  targetDoc?.review_status === 'COMPLETED' ||
                  isReviewed
                );
                const isRejected = !isCompletedCycle && Boolean(
                  record.rejectionRemarks || record.rejection_remarks || targetDoc?.rejection_remarks
                );

                // Check review outcomes for contextual action buttons
                const effectiveOutcome =
                  record.outcome ||
                  record.reviewOutcome ||
                  targetDoc?.periodic_review_outcome ||
                  targetDoc?.review_outcome ||
                  targetDoc?.reviewOutcome ||
                  '';

                const isObsoleteRequired = Boolean(
                  effectiveOutcome === 'OBSOLETE_REQUIRED' ||
                  effectiveOutcome === 'INTERNAL_OBSOLETE_REQUIRED' ||
                  effectiveOutcome === 'EXTERNAL_NO_LONGER_APPLICABLE' ||
                  record.status === 'OBSOLETE_REQUIRED' ||
                  targetDoc?.review_status === 'OBSOLETE_REQUIRED'
                );

                const isRevisionRequired = Boolean(
                  !isObsoleteRequired && (
                    effectiveOutcome === 'REVISION_REQUIRED' ||
                    effectiveOutcome === 'INTERNAL_REVISION_REQUIRED' ||
                    effectiveOutcome === 'EXTERNAL_NEW_VERSION' ||
                    record.status === 'REVISION_REQUIRED' ||
                    targetDoc?.review_status === 'REVISION_REQUIRED' ||
                    record.status === 'AWAITING_ACTION' ||
                    targetDoc?.review_status === 'AWAITING_ACTION'
                  )
                );

                const hasActiveLinkedRequest = Boolean(
                  record.linkedActionId ||
                  record.linkedRequestId ||
                  record.linked_request_id ||
                  record.linkedDraftId ||
                  targetDoc?.linked_request_id ||
                  targetDoc?.linkedActionId ||
                  targetDoc?.linkedRequestId
                );

                const hasPendingIntent = !hasActiveLinkedRequest && (isRevisionRequired || isObsoleteRequired);

                // Priority 1: Completed review strictly takes precedence; followed by pending workflow and date calculations
                let effectiveStatus = calculatedStatus;
                if (isCompletedCycle) {
                  effectiveStatus = 'COMPLETED';
                } else if (record.status === 'PENDING_APPROVAL' || targetDoc?.review_status === 'PENDING_APPROVAL' || isPendingApproval) {
                  effectiveStatus = 'PENDING_APPROVAL';
                } else if (isRejected) {
                  effectiveStatus = 'REJECTED';
                } else if (effectiveOutcome === 'OBSOLETE_REQUIRED' || isObsoleteRequired) {
                  effectiveStatus = 'OBSOLETE_REQUIRED';
                } else if (
                  effectiveOutcome === 'REVISION_REQUIRED' ||
                  record.status === 'AWAITING_ACTION' ||
                  targetDoc?.review_status === 'AWAITING_ACTION' ||
                  isRevisionRequired
                ) {
                  effectiveStatus = 'REVISION_REQUIRED';
                } else if (calculatedStatus === 'OVERDUE' || calculatedStatus === 'DUE_SOON' || calculatedStatus === 'UP_TO_DATE') {
                  effectiveStatus = calculatedStatus;
                } else {
                  effectiveStatus = record.status === 'IN_PROGRESS' ? record.status : calculatedStatus || record.status;
                }

                // Safety guard: Under NO circumstances should pending workflow show UP_TO_DATE / ยังไม่ถึงกำหนด
                const isPendingWorkflow = Boolean(
                  !isCompletedCycle && (
                    effectiveStatus === 'PENDING_APPROVAL' ||
                    effectiveStatus === 'OBSOLETE_REQUIRED' ||
                    effectiveStatus === 'REVISION_REQUIRED' ||
                    record.status === 'AWAITING_ACTION' ||
                    targetDoc?.review_status === 'AWAITING_ACTION'
                  )
                );
                if (isPendingWorkflow && (effectiveStatus === 'UP_TO_DATE' || effectiveStatus === 'NORMAL')) {
                  effectiveStatus = isObsoleteRequired ? 'OBSOLETE_REQUIRED' : (isPendingApproval ? 'PENDING_APPROVAL' : 'REVISION_REQUIRED');
                }

                const badge = getStatusBadgeConfig(effectiveStatus, record.hasActiveTask, effectiveStatus === 'PENDING_APPROVAL', effectiveStatus === 'COMPLETED', diffDays);

                const userCanApprove = canUserApprove(record, targetDoc);
                const reviseTask = (tasks || []).find(t =>
                  (t.type === 'PERIODIC_REVIEW_REVISE' || t.taskType === 'PERIODIC_REVIEW_REVISE') &&
                  t.status === 'PENDING' && (
                    (targetDoc?.id && t.docId === targetDoc.id) ||
                    (record.documentNumber && t.docCode === record.documentNumber)
                  )
                );
                const userCanReReview = Boolean(
                  currentUser && (
                    (reviseTask?.assigneeId || reviseTask?.assignee_id) === currentUser.id ||
                    targetDoc?.ownerId === currentUser.id || targetDoc?.owner_id === currentUser.id
                  )
                );
                return (
                  <tr key={record.id} className="hover:bg-[#F5F5F5]/70 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-[#0D99FF] text-xs sm:text-sm whitespace-nowrap">
                      {record.documentNumber}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 text-xs sm:text-sm break-all break-words min-w-0 [overflow-wrap:anywhere] leading-relaxed">
                      {record.documentName}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-600 text-xs">
                      {record.ownerDepartmentId}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700 text-xs">
                      {formatPeriodicDocVersion(record, targetDoc, categoryTab === 'EXTERNAL')}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-600 text-xs whitespace-nowrap">
                      {formatQmsDisplayDate(record.nextReviewDate)}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {effectiveStatus === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>ทบทวนแล้วเสร็จ</span>
                        </span>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        {/* Primary Action (ปุ่มหลัก) */}
                        {effectiveStatus === 'PENDING_APPROVAL' ? (
                          userCanApprove ? (
                            <button
                              type="button"
                              onClick={() => handleApproveClick(record, targetDoc)}
                              className="h-8 px-2.5 text-xs inline-flex items-center gap-1 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer"
                              title="พิจารณาอนุมัติผลการทบทวนเอกสาร"
                              aria-label="อนุมัติผล"
                            >
                              <CheckCircle2 size={13} />
                              <span>อนุมัติผล</span>
                            </button>
                          ) : (
                            <button
                              disabled
                              className="h-8 px-2.5 text-xs inline-flex items-center gap-1 rounded-lg font-semibold bg-amber-50 text-amber-700 border border-amber-200 cursor-not-allowed opacity-80"
                              title="อยู่ระหว่างรอหัวหน้าแผนกอนุมัติผล"
                              aria-label="รอหัวหน้าอนุมัติ"
                            >
                              <Clock size={13} />
                              <span>รอหัวหน้าอนุมัติ</span>
                            </button>
                          )
                        ) : isRejected && userCanReReview ? (
                          <button
                            type="button"
                            onClick={() => handleNavigateRecord(targetDoc ? { ...record, targetDoc } : record, { isReEvaluating: true })}
                            className="h-8 px-2.5 text-xs inline-flex items-center gap-1 rounded-lg font-semibold bg-orange-500 hover:bg-orange-600 text-white shadow-2xs transition-colors cursor-pointer"
                            title="ทบทวนผลใหม่ตามข้อเสนอแนะของหัวหน้าแผนก"
                            aria-label="ทบทวนใหม่"
                          >
                            <RotateCcw size={13} />
                            <span>ทบทวนใหม่</span>
                          </button>
                        ) : isRevisionRequired ? (
                          <button
                            type="button"
                            onClick={() => {
                              navigate(
                                `/dcc/external-docs?openDocCode=${encodeURIComponent(record.documentNumber)}&autoOpenUpdate=true`,
                                { state: { openDocCode: record.documentNumber, autoOpenUpdate: true } }
                              );
                            }}
                            className="h-8 px-2.5 text-xs inline-flex items-center gap-1 rounded-lg font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition-colors cursor-pointer"
                            title="ไปที่คลังเอกสารภายนอกเพื่ออัปเดตฉบับใหม่"
                            aria-label="อัปเดตฉบับใหม่"
                          >
                            <FileEdit size={13} />
                            <span>อัปเดตฉบับใหม่</span>
                          </button>
                        ) : isObsoleteRequired ? (
                          <button
                            type="button"
                            onClick={() => {
                              navigate(
                                `/dcc/external-docs?openDocCode=${encodeURIComponent(record.documentNumber)}&autoOpenObsolete=true`,
                                { state: { openDocCode: record.documentNumber, autoOpenObsolete: true } }
                              );
                            }}
                            className="h-8 px-2.5 text-xs inline-flex items-center gap-1 rounded-lg font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-colors cursor-pointer"
                            title="ไปที่คลังเอกสารภายนอกเพื่อขอยกเลิกเอกสาร"
                            aria-label="ขอยกเลิกเอกสาร"
                          >
                            <Ban size={13} />
                            <span>ขอยกเลิกเอกสาร</span>
                          </button>
                        ) : effectiveStatus === 'COMPLETED' ? (
                          <button
                            disabled
                            className="h-8 px-2.5 text-xs text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed inline-flex items-center gap-1 border border-slate-200"
                            title="เอกสารผ่านการทบทวนรอบปีนี้เรียบร้อยแล้ว"
                            aria-label="ทบทวนแล้ว"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>ทบทวนแล้ว</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleNavigateRecord(targetDoc ? { ...record, targetDoc } : record)}
                            className="h-8 px-2.5 text-xs inline-flex items-center gap-1 rounded-lg font-semibold bg-[#0D99FF] hover:bg-[#007BE5] text-white shadow-2xs transition-colors cursor-pointer"
                            title="บันทึกผลการทบทวน"
                            aria-label="บันทึกผล"
                          >
                            <RotateCw size={13} />
                            <span>บันทึกผล</span>
                          </button>
                        )}

                        {/* Secondary Actions (ปุ่มรอง - Compact Icon-only) */}
                        {hasPendingIntent && (
                          <button
                            type="button"
                            onClick={() => handleNavigateRecord(targetDoc ? { ...record, targetDoc } : record, { isReEvaluating: true })}
                            className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg border border-slate-200 hover:border-sky-300 transition-colors cursor-pointer shrink-0"
                            title="เปลี่ยนผลการประเมิน"
                            aria-label="เปลี่ยนผลการทบทวน"
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenHistory(record)}
                          className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer shrink-0"
                          title="ดูประวัติการทบทวน"
                          aria-label="ดูประวัติการทบทวน"
                        >
                          <History size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pagination.paginatedData.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-slate-400">
                    <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-xs text-slate-600">ไม่พบเอกสารที่ตรงกับเงื่อนไขการค้นหา</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </div>

      {/* Review History Modal */}
      <ReviewHistoryModal
        isOpen={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        record={historyTarget?.record}
        doc={historyTarget?.doc}
        effectiveToday={effectiveToday}
        onNavigateRecord={handleNavigateRecord}
      />

      {/* Periodic Review Approval Modal */}
      <PeriodicReviewApprovalModal
        isOpen={Boolean(approvalTaskTarget)}
        onClose={() => setApprovalTaskTarget(null)}
        task={approvalTaskTarget}
      />
    </div>
  );
};

const isInactiveDocumentRecord = (d) => {
  if (!d) return true;
  const st = String(d.status || '').toUpperCase();
  return (
    st === 'SUPERSEDED' ||
    st === 'OBSOLETE' ||
    st === 'SUPERSEDED_ARCHIVED' ||
    st === 'OBSOLETE_ARCHIVED' ||
    st === 'REJECTED' ||
    st === 'DRAFT' ||
    st === 'PENDING_EXT_REVIEW' ||
    st === 'PENDING_EXT_APPROVAL' ||
    Boolean(d.is_superseded || d.is_obsolete || d.isSuperseded || d.isObsolete)
  );
};

const PeriodicReviewDashboard = () => {
  const { currentUser, periodicReviewSchedules, documents, externalDocuments, tasks, simulatedSystemDate, getEffectiveToday } = useStore();

  const isDccUser = Boolean(
    currentUser?.role === 'DCC' ||
    currentUser?.role === 'DCC_ADMIN' ||
    currentUser?.isDcc ||
    currentUser?.is_dcc
  );

  const isManagementOrDcc = Boolean(
    isDccUser ||
    Number(currentUser?.level) >= 5 || 
    Number(currentUser?.approval_level) >= 5 ||
    currentUser?.is_hod || 
    currentUser?.is_manager ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'QMR' ||
    (Array.isArray(currentUser?.managedDepartments) && currentUser?.managedDepartments.includes('*'))
  );

  // default: หากเป็น DCC ให้เริ่มที่ 'ALL', หากเป็นผู้ใช้ทั่วไปให้เริ่มที่ 'MY_DEPT'
  const [viewScope, setViewScope] = useState(isDccUser ? 'ALL' : 'MY_DEPT');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');

  const allDocs = useMemo(() => [...(documents || []), ...(externalDocuments || [])], [documents, externalDocuments]);
  const activeDocs = useMemo(() => (allDocs || []).filter(d => !isInactiveDocumentRecord(d)), [allDocs]);
  const effectiveToday = useMemo(() => {
    return getEffectiveToday ? getEffectiveToday() : (simulatedSystemDate ? new Date(simulatedSystemDate) : new Date());
  }, [simulatedSystemDate, getEffectiveToday]);

  const effectiveSchedules = useMemo(() => {
    const existing = [];
    const registeredDocIds = new Set();

    (periodicReviewSchedules || []).forEach(s => {
      if (s.isActive === false) return;
      const schedDocId = String(s.documentId || s.externalDocumentId || '');
      const schedCode = String(s.documentNumber || '').trim();
      const matchedActive = activeDocs.find(d =>
        (schedDocId && String(d.id) === schedDocId) ||
        (schedCode && (
          d.edCode === schedCode ||
          d.doc_code === schedCode ||
          d.code === schedCode ||
          d.document_number === schedCode ||
          d.docNo === schedCode ||
          d.title === schedCode
        ))
      );
      const matchedAny = (allDocs || []).find(d =>
        (schedDocId && String(d.id) === schedDocId) ||
        (schedCode && (
          d.edCode === schedCode ||
          d.doc_code === schedCode ||
          d.code === schedCode ||
          d.document_number === schedCode ||
          d.docNo === schedCode ||
          d.title === schedCode
        ))
      );
      if (matchedAny && !matchedActive) return;

      const isExt = Boolean(
        s.documentCategory === 'EXTERNAL' ||
        s.isExternal ||
        s.externalDocumentId ||
        matchedActive?.is_external ||
        matchedActive?.external ||
        matchedActive?.doc_type === 'EXTERNAL' ||
        matchedActive?.edCode ||
        String(schedCode).startsWith('ED-')
      );
      const resolvedNext = isExt
        ? (matchedActive?.nextReviewDate || matchedActive?.next_review_date || s.nextReviewDate || s.next_review_date || s.currentScheduledReviewDate)
        : (matchedActive?.next_review_date || matchedActive?.nextReviewDate || s.nextReviewDate || s.next_review_date || s.currentScheduledReviewDate);

      existing.push(matchedActive ? {
        ...s,
        documentId: matchedActive.id,
        targetDoc: matchedActive,
        isExternal: isExt,
        documentCategory: isExt ? 'EXTERNAL' : 'INTERNAL',
        nextReviewDate: resolvedNext,
        next_review_date: resolvedNext,
        currentScheduledReviewDate: resolvedNext,
        is_reviewed_this_cycle: Boolean(s.is_reviewed_this_cycle || matchedActive.is_reviewed_this_cycle),
        status: (s.status === 'COMPLETED' || matchedActive.review_status === 'COMPLETED' || matchedActive.is_reviewed_this_cycle) ? 'COMPLETED' : s.status,
        review_status: (s.status === 'COMPLETED' || matchedActive.review_status === 'COMPLETED' || matchedActive.is_reviewed_this_cycle) ? 'COMPLETED' : (matchedActive.review_status || s.review_status || s.status)
      } : {
        ...s,
        isExternal: isExt,
        documentCategory: isExt ? 'EXTERNAL' : 'INTERNAL',
        nextReviewDate: resolvedNext,
        next_review_date: resolvedNext,
        currentScheduledReviewDate: resolvedNext
      });
      if (schedDocId) registeredDocIds.add(schedDocId);
      if (matchedActive?.id) registeredDocIds.add(String(matchedActive.id));
      if (schedCode) registeredDocIds.add(schedCode);
    });

    // If there are active documents not yet in schedules, synthesize schedule representations
    activeDocs.forEach(doc => {
      const docIdStr = String(doc.id || '');
      const docCode = String(doc.edCode || doc.doc_code || doc.code || doc.document_number || doc.title || doc.docNo || docIdStr).trim();
      if (registeredDocIds.has(docIdStr) || registeredDocIds.has(docCode)) return;

      const isExternal = Boolean(
        doc.is_external ||
        doc.external ||
        doc.document_type === 'EXTERNAL' ||
        doc.doc_type === 'EXTERNAL' ||
        doc.edCode ||
        String(docCode).startsWith('ED-') ||
        (externalDocuments || []).some(ed => ed.id === doc.id)
      );
      const docDept = doc.department || doc.dept || doc.owner_dept || extractDeptCode(docCode) || (isExternal ? 'DC' : 'QA');
      const nextReviewDate = isExternal
        ? (doc.nextReviewDate || doc.next_review_date || doc.effectiveDate || doc.effective_date)
        : (doc.next_review_date || doc.nextReviewDate || doc.effectiveDate || doc.effective_date);
      if (!nextReviewDate) return;

      const dateStatus = getPeriodicReviewStatus(nextReviewDate, effectiveToday).status;
      const isDateDue = dateStatus === 'OVERDUE' || dateStatus === 'DUE_SOON';

      const activeTask = isDateDue ? (tasks || []).find(t =>
        (t.type === 'PERIODIC_REVIEW' || t.taskType === 'PERIODIC_REVIEW' || t.type === 'EXTERNAL_VERIFICATION' || t.taskType === 'EXTERNAL_VERIFICATION') &&
        t.status !== 'COMPLETED' &&
        !t.is_completed &&
        (t.docId === doc.id || t.documentId === doc.id || t.docCode === docCode || t.documentNumber === docCode)
      ) : null;

      const rawRev = doc.revision || doc.rev || doc.revNo || '00';
      const cleanRev = String(rawRev).trim().replace(/^Rev\.?\s*/i, '') || '00';

      existing.push({
        id: `PRS-AUTO-${doc.id}`,
        documentCategory: isExternal ? 'EXTERNAL' : 'INTERNAL',
        documentId: doc.id,
        externalDocumentId: isExternal ? doc.id : undefined,
        documentNumber: docCode,
        documentName: doc.name || doc.doc_name || doc.title || docCode,
        ownerUserId: doc.ownerId || doc.owner_id || doc.owner || 'U002',
        ownerDepartmentId: docDept,
        responsibleUserId: doc.ownerId || doc.owner_id || doc.owner || 'U002',
        currentScheduledReviewDate: nextReviewDate,
        nextReviewDate: nextReviewDate,
        next_review_date: nextReviewDate,
        rev: cleanRev,
        edition: doc.sourceVersion || doc.edition || '',
        sourceVersion: doc.sourceVersion || doc.edition || '',
        isExternal,
        status: (doc.is_reviewed_this_cycle || doc.review_status === 'COMPLETED')
          ? 'COMPLETED'
          : (isDateDue ? (doc.review_status || (activeTask ? 'ACTION_REQUIRED' : 'DUE_SOON')) : 'UP_TO_DATE'),
        dueState: getDueState ? getDueState(nextReviewDate, effectiveToday) : 'UPCOMING',
        hasActiveTask: Boolean(activeTask),
        isActive: true,
        lastReviewedDate: doc.last_reviewed_at,
        last_reviewed_at: doc.last_reviewed_at,
        periodic_reviews: doc.periodic_reviews,
        is_reviewed_this_cycle: doc.is_reviewed_this_cycle,
        targetDoc: doc,
        createdAt: doc.createdAt || new Date().toISOString(),
        updatedAt: doc.updatedAt || new Date().toISOString()
      });
      registeredDocIds.add(docIdStr);
      registeredDocIds.add(docCode);
    });

    return existing;
  }, [periodicReviewSchedules, activeDocs, allDocs, externalDocuments, tasks, effectiveToday]);

  const visibleRecords = useMemo(
    () => {
      const records = isManagementOrDcc
        ? effectiveSchedules.map(s => normalizePeriodicReviewRecord(s, effectiveToday))
        : getVisiblePeriodicReviews(currentUser, effectiveSchedules, activeDocs, effectiveToday);

      return records.map(r => {
        const targetDoc =
          activeDocs.find(
            d =>
              (r.documentId && d.id === r.documentId) ||
              (r.externalDocumentId && d.id === r.externalDocumentId)
          ) ||
          activeDocs.find(
            d =>
              r.documentNumber &&
              (d.edCode === r.documentNumber ||
                d.doc_code === r.documentNumber ||
                d.code === r.documentNumber ||
                d.document_number === r.documentNumber ||
                d.docNo === r.documentNumber ||
                d.title === r.documentNumber)
          ) ||
          r.targetDoc;

        const isExternal = Boolean(
          r.isExternal ||
          r.documentCategory === 'EXTERNAL' ||
          r.externalDocumentId ||
          targetDoc?.is_external ||
          targetDoc?.external ||
          targetDoc?.doc_type === 'EXTERNAL' ||
          targetDoc?.edCode ||
          String(r.documentNumber || '').startsWith('ED-') ||
          (externalDocuments || []).some(
            ed =>
              ed.id === r.documentId ||
              ed.id === r.externalDocumentId ||
              ed.edCode === r.documentNumber ||
              ed.doc_code === r.documentNumber ||
              ed.document_number === r.documentNumber
          )
        );

        const resolvedNextReviewDate = isExternal
          ? (targetDoc?.nextReviewDate || targetDoc?.next_review_date || r.nextReviewDate || r.currentScheduledReviewDate)
          : (targetDoc?.next_review_date || targetDoc?.nextReviewDate || r.nextReviewDate || r.currentScheduledReviewDate);

        const rawRev = targetDoc?.revision || targetDoc?.rev || targetDoc?.revNo || r.rev || '00';
        const cleanRev = String(rawRev).trim().replace(/^Rev\.?\s*/i, '') || '00';
        const resolvedEdition = targetDoc?.sourceVersion || targetDoc?.edition || r.edition || r.sourceVersion || '';

        const docToEval = targetDoc ? {
          ...targetDoc,
          ...r,
          nextReviewDate: resolvedNextReviewDate,
          next_review_date: resolvedNextReviewDate,
          currentScheduledReviewDate: resolvedNextReviewDate,
          isExternal
        } : {
          ...r,
          nextReviewDate: resolvedNextReviewDate,
          next_review_date: resolvedNextReviewDate,
          currentScheduledReviewDate: resolvedNextReviewDate,
          isExternal
        };
        const evaluation = evaluateDocumentReviewStatus(docToEval, effectiveToday);
        const dynamicStatus = typeof evaluation === 'object' ? evaluation.status : evaluation;
        const isPendingApproval = r.status === 'PENDING_APPROVAL' || targetDoc?.review_status === 'PENDING_APPROVAL';

        return {
          ...r,
          targetDoc,
          isExternal,
          documentCategory: isExternal ? 'EXTERNAL' : 'INTERNAL',
          rev: cleanRev,
          edition: resolvedEdition,
          sourceVersion: resolvedEdition,
          nextReviewDate: resolvedNextReviewDate,
          currentScheduledReviewDate: resolvedNextReviewDate,
          next_review_date: resolvedNextReviewDate,
          status: isPendingApproval ? 'PENDING_APPROVAL' : dynamicStatus,
          dueState: typeof evaluation === 'object' && evaluation.diffDays > 30 ? 'UPCOMING' : (evaluation?.status || 'UPCOMING'),
          lastReviewedDate: r.lastReviewedDate || targetDoc?.last_reviewed_at,
          last_reviewed_at: r.lastReviewedDate || targetDoc?.last_reviewed_at,
          periodic_reviews: targetDoc?.periodic_reviews || r.periodic_reviews,
          is_reviewed_this_cycle: r.is_reviewed_this_cycle || targetDoc?.is_reviewed_this_cycle
        };
      });
    },
    [currentUser, effectiveSchedules, activeDocs, externalDocuments, effectiveToday, isManagementOrDcc]
  );

  const handleExportCsv = () => {
    if (!canExportPeriodicReviews(currentUser)) return;
    const rows = [
      ['เลขที่เอกสาร', 'ชื่อเอกสาร', 'ฉบับที่ (Rev)', 'ประเภทเอกสาร', 'แผนกเจ้าของเอกสาร', 'เจ้าของเอกสาร', 'วันที่บังคับใช้', 'วันที่ทบทวนล่าสุด', 'วันที่ครบกำหนด', 'สถานะการทบทวน', 'ผลการทบทวน', 'ผู้ทบทวน', 'วันที่ดำเนินการ', 'เลขที่ DAR ที่เชื่อมโยง', 'จำนวนวันเกินกำหนด']
    ];
    visibleRecords.forEach(r => {
      rows.push([
        r.documentNumber || '',
        r.documentName || '',
        r.rev || '',
        r.documentCategory || '',
        r.ownerDepartmentId || '',
        r.ownerUserId || '',
        r.originalReviewAnchorDate || '',
        r.lastReviewedDate || '',
        r.nextReviewDate || '',
        getReviewStatusLabel(r.status)?.label || '',
        getReviewOutcomeLabel(r.outcome)?.label || '',
        '',
        r.updatedAt || '',
        r.linkedActionId || '',
        r.overdueDays || 0
      ]);
    });
    const csvContent = "\uFEFF" + rows.map(e => e.map(cell => `"${(cell||'').toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `periodic_reviews_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#1E1E1E] tracking-tight flex items-center gap-2">
            <RotateCw className="text-[#0D99FF]" size={24} /> การทบทวนเอกสารตามรอบ
          </h1>
          <p className="text-xs text-[#666666] mt-0.5">
            {viewScope === 'MY_DEPT' ? 'งานทบทวนเอกสารของแผนกฉัน' : 'ภาพรวมการทบทวนเอกสารทุกแผนก'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isManagementOrDcc && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setViewScope('MY_DEPT');
                  setSelectedDeptFilter(currentUser?.department || 'ALL');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  viewScope === 'MY_DEPT'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                งานของแผนกฉัน{currentUser?.department ? ` (${currentUser.department})` : ''}
              </button>

              <button
                onClick={() => {
                  setViewScope('ALL');
                  setSelectedDeptFilter('ALL');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  viewScope === 'ALL'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                ภาพรวมทุกแผนก
              </button>
            </div>
          )}

          {canExportPeriodicReviews(currentUser) && (
            <div className="flex flex-col items-end gap-0.5">
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5E5E5] text-slate-700 rounded-lg hover:bg-[#F5F5F5] text-xs font-medium transition-colors shadow-xs cursor-pointer"
              >
                <Download size={14} /> ส่งออก CSV
              </button>
              <span className="text-[10px] text-slate-400">สามารถเปิดด้วย Microsoft Excel ได้</span>
            </div>
          )}
        </div>
      </div>

      <UnifiedWorkspaceView
        visibleRecords={visibleRecords}
        allDocs={allDocs}
        effectiveToday={effectiveToday}
        viewScope={viewScope}
        setViewScope={setViewScope}
        selectedDeptFilter={selectedDeptFilter}
        setSelectedDeptFilter={setSelectedDeptFilter}
        isManagementOrDcc={isManagementOrDcc}
      />
    </div>
  );
};

export default PeriodicReviewDashboard;
