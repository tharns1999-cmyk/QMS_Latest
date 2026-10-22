import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Printer, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Building2, 
  MapPin, 
  FileDown, 
  X, 
  Layers, 
  PlusCircle, 
  Check,
  History,
  FolderOpen,
  Archive,
  Flame,
  Copy,
  ChevronRight,
  ChevronDown,
  AlertOctagon
} from 'lucide-react';
import useStore from '../../../../store/useStore';
import { UniversalWatermarkService, WATERMARK_TYPES } from '../../services/UniversalWatermarkService';
import toast from 'react-hot-toast';
import { formatQmsDate } from '../../../../shared/utils/dateFormatter';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import DccRecallActionModal from '../../components/modals/DccRecallActionModal';
import {
  isThaiText,
  resolveCopyDoc,
  resolveDocCode,
  resolveDocTitle,
  resolveDocVersion,
  resolveOwnerDept
} from '../../utils/documentUtils';

export {
  isThaiText,
  resolveCopyDoc,
  resolveDocCode,
  resolveDocTitle,
  resolveDocVersion,
  resolveOwnerDept
};

const ControlledCopyRegister = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'PENDING_ISSUE';

  const { 
    currentUser, 
    controlledCopyInstances, 
    documentControlledCopies,
    issueControlledCopy, 
    dispatchControlledCopy,
    markCopyPrinted,
    reportCcDamagedLost, 
    completeRecallChecklist: _completeRecallChecklist,
    recordCopyRecalled: _recordCopyRecalled,
    destroyControlledCopy: _destroyControlledCopy,
    toggleCopyRecallReceived,
    copyDispositionRecords,
    documents,
    externalDocuments,
    tasks,
    controlledCopyAuditTrail,
    actionLog,
    masterDepartments,
    departments: storeDepts,
    distributionLocations
  } = useStore();

  const navigate = useNavigate();
  const isDccUser = Boolean(currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN' || currentUser?.role === 'DCC_STAFF');

  React.useEffect(() => {
    if (!isDccUser) {
      toast.error('คุณไม่มีสิทธิ์เข้าถึงศูนย์ควบคุมงาน DCC', { id: 'dcc-access-denied' });
      navigate('/dashboard');
    }
  }, [isDccUser, navigate]);

  // Merge & synchronize copies collection
  const allCopies = useMemo(() => {
    const list = (controlledCopyInstances && controlledCopyInstances.length > 0)
      ? controlledCopyInstances
      : (documentControlledCopies || []);
    return (list || []).filter(Boolean);
  }, [controlledCopyInstances, documentControlledCopies]);

  // Tab State
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab === 'ACTION_REQUIRED' || initialTab === 'PENDING_PRINT') return 'PENDING_ISSUE';
    if (initialTab === 'DISPATCHED') return 'DISPATCHED_TRACKING';
    if (initialTab === 'RECALL') return 'RECALL_CHECKLIST';
    if (initialTab === 'ACTIVE') return 'ACTIVE_REGISTER';
    if (initialTab === 'HISTORY') return 'AUDIT_TRAIL';
    return initialTab;
  });

  const handleTabChange = (tabId) => {
    let normalized = tabId;
    if (tabId === 'PENDING_PRINT') normalized = 'PENDING_ISSUE';
    if (tabId === 'DISPATCHED') normalized = 'DISPATCHED_TRACKING';
    if (tabId === 'RECALL') normalized = 'RECALL_CHECKLIST';
    if (tabId === 'ACTIVE') normalized = 'ACTIVE_REGISTER';
    if (tabId === 'HISTORY') normalized = 'AUDIT_TRAIL';
    setActiveTab(normalized);
    setSearchParams({ tab: normalized });
  };

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');

  // Multi-selection state for batch actions
  const [selectedCopyIds, setSelectedCopyIds] = useState([]);

  // Audit Trail sub-tab state ('ACTIVITY' | 'DISPOSITION')
  const [auditSubTab, setAuditSubTab] = useState('ACTIVITY');
  const [dispositionSearchTerm, setDispositionSearchTerm] = useState('');

  // Loading States
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [isBatchDispatching, setIsBatchDispatching] = useState(false);
  const [processingCopyId, setProcessingCopyId] = useState(null);

  // Modals state
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueDoc, setIssueDoc] = useState('');
  const [issueDept, setIssueDept] = useState('');
  const [issueLocation, setIssueLocation] = useState('');

  // DCC Recall Action Modal state
  const [recallModalGroup, setRecallModalGroup] = useState(null);

  // Poka-Yoke: Unprinted Warning Modal state
  const [unprintedWarningModal, setUnprintedWarningModal] = useState({ isOpen: false, targetItem: null });

  // Available Stations for Issue Modal based on selected issueDept
  const availableIssueStations = useMemo(() => {
    if (!issueDept) return [];
    const norm = issueDept.trim().toUpperCase();
    return (distributionLocations || []).filter(s => 
      s.status !== 'INACTIVE' && (
        (s.departmentId || '').toUpperCase() === norm
      )
    );
  }, [issueDept, distributionLocations]);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [reportType, setReportType] = useState('DAMAGED');
  const [reportReason, setReportReason] = useState('');

  // Audit Trail states
  const [auditSearchTerm, setAuditSearchTerm] = useState('');

  // Department List for Filter
  const departmentList = useMemo(() => {
    const depts = new Set();
    allCopies.forEach(c => {
      const d = c.holder_dept || c.department;
      if (d) depts.add(d);
    });
    return Array.from(depts);
  }, [allCopies]);

  // Categorized Copies Counts
  const counts = useMemo(() => {
    const pendingIssue = allCopies.filter(c => 
      c.status === 'PENDING_ISSUE' || 
      c.status === 'PENDING_PRINT' || 
      c.status === 'PENDING_DISPATCH'
    ).length;

    const dispatched = allCopies.filter(c => 
      c.status === 'DISPATCHED_PENDING_RECEIPT' || 
      c.status === 'DISPATCHED' || 
      c.status === 'PENDING_RECEIPT' || 
      c.status === 'IN_TRANSIT'
    ).length;
    
    // Recall count: Copies with SUPERSEDED_PENDING_RECALL, PENDING_RECALL, RECALLED, OBSOLETE_PENDING_RECALL, DAMAGED_PENDING_REPLACEMENT or active copies of superseded/obsolete docs
    // STRICTLY EXCLUDE LOST / LOST_RECORDED / DECLARED_LOST
    const recallCopies = allCopies.filter(c => {
      if (!c) return false;
      if (c.status === 'LOST' || c.status === 'LOST_RECORDED' || c.status === 'DECLARED_LOST') return false;
      if (
        c.status === 'SUPERSEDED_PENDING_RECALL' ||
        c.status === 'PENDING_RECALL' || 
        c.status === 'DAMAGED_PENDING_RECALL' || 
        c.status === 'RECALLED' || 
        c.status === 'OBSOLETE_PENDING_RECALL' || 
        c.status === 'DAMAGED_PENDING_REPLACEMENT' ||
        ((c.isDamaged || c.is_damaged) && c.status !== 'DESTROYED' && c.status !== 'RECALLED_DESTROYED' && c.status !== 'ARCHIVED_OBSOLETE')
      ) return true;
      const doc = (documents || []).find(d => String(d.id) === String(c.doc_id || c.docId))
        || (externalDocuments || []).find(d => String(d.id) === String(c.doc_id || c.docId || c.external_doc_id));
      const isDocSupersededOrObsolete = Boolean(
        doc && (
          doc.status === 'SUPERSEDED' || 
          doc.status === 'SUPERSEDED_ARCHIVED' || 
          doc.status === 'OBSOLETE' || 
          doc.status === 'OBSOLETE_ARCHIVED' ||
          doc.is_superseded ||
          doc.is_obsolete
        )
      );
      return isDocSupersededOrObsolete && (c.status === 'ACTIVE' || c.status === 'ISSUED_ACTIVE' || c.status === 'RECEIVED');
    });

    const active = allCopies.filter(c => {
      if (!c) return false;
      if (['PENDING_ISSUE', 'PENDING_PRINT', 'PENDING_DISPATCH', 'DISPATCHED', 'DISPATCHED_PENDING_RECEIPT', 'PENDING_RECEIPT', 'SUPERSEDED_PENDING_RECALL', 'PENDING_RECALL', 'RECALLED_PENDING_DESTRUCTION', 'DESTROYED', 'ARCHIVED_OBSOLETE'].includes(c.status)) return false;
      if (c.is_active_in_field === false || c.is_superseded || c.is_obsolete) return false;
      const isStatusActive = ['IN_USE', 'ISSUED_ACTIVE', 'ACTIVE'].includes(c.status);
      const isFieldActive = c.is_active_in_field === true || (c.is_active_in_field !== false && (Boolean(c.receipt_confirmed_at) || Boolean(c.received_at)));
      return isStatusActive && isFieldActive;
    }).length;

    return {
      pendingIssue,
      dispatched,
      recall: recallCopies.length,
      active
    };
  }, [allCopies, documents, externalDocuments]);

  // Combined and Safe Audit / History Logs
  const dccHistoryLogs = useMemo(() => {
    const list = [
      ...(controlledCopyAuditTrail || []).map(l => ({
        id: l.id || `cc-audit-${Math.random()}`,
        timestamp: l.timestamp || l.createdAt || new Date().toISOString(),
        action: l.action || l.actionType || 'กิจกรรมสำเนา',
        document_code: l.document_code || l.doc_code || l.code || (!isThaiText(l.docTitle) && l.docTitle ? l.docTitle : null) || (!isThaiText(l.title) && l.title ? l.title : null) || '-',
        revision: l.revision || l.docRev || '',
        copy_number: l.ccNumber || l.copy_no || l.copy_number || '',
        performed_by: l.user || l.actor || l.performed_by || 'DCC Officer',
        details: l.remarks || l.details || l.remark || '-'
      })),
      ...(actionLog || []).filter(l => (l.actionType || '').startsWith('CC_') || (l.action || '').startsWith('CC_') || (l.actionType || '').startsWith('DAR_') || (l.action || '').startsWith('DAR_')).map(l => ({
        id: l.id || `action-log-${Math.random()}`,
        timestamp: l.timestamp || new Date().toISOString(),
        action: l.actionType || l.action || 'บันทึกการทำงาน',
        document_code: l.document_code || l.doc_code || l.code || (!isThaiText(l.docTitle) && l.docTitle ? l.docTitle : null) || (!isThaiText(l.title) && l.title ? l.title : null) || l.darNo || '-',
        revision: l.revision || l.docRev || '',
        copy_number: l.ccNumber || l.copy_no || l.copy_number || '',
        performed_by: l.actor || l.user || 'DCC Officer',
        details: l.details || l.remark || '-'
      }))
    ];

    const seen = new Set();
    return list.filter(item => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [controlledCopyAuditTrail, actionLog]);

  // Tab definitions
  const tabs = [
    { 
      id: 'PENDING_ISSUE', 
      aliases: ['PENDING_PRINT', 'PENDING_ISSUE'],
      label: 'รอออกสำเนา', 
      legacyLabel: '1. รายการรอออกสำเนา',
      count: counts.pendingIssue,
      icon: Printer
    },
    { 
      id: 'DISPATCHED_TRACKING', 
      aliases: ['DISPATCHED', 'DISPATCHED_TRACKING'],
      label: 'ติดตามส่งมอบ', 
      legacyLabel: '2. ติดตามการส่งมอบ',
      count: counts.dispatched,
      icon: Clock
    },
    { 
      id: 'RECALL_CHECKLIST', 
      aliases: ['RECALL', 'RECALL_CHECKLIST'],
      label: 'เรียกคืน/ทำลาย', 
      legacyLabel: '3. เช็กลิสต์เรียกคืนเอกสาร',
      count: counts.recall,
      icon: AlertTriangle
    },
    { 
      id: 'ACTIVE_REGISTER', 
      aliases: ['ACTIVE', 'ACTIVE_REGISTER'],
      label: 'สำเนาในจุดใช้งาน', 
      legacyLabel: '4. สำเนาใช้งานจริง',
      count: counts.active,
      icon: Layers
    },
    { 
      id: 'AUDIT_TRAIL', 
      aliases: ['HISTORY', 'AUDIT_TRAIL'],
      label: 'ประวัติและสมุดทะเบียน', 
      legacyLabel: '5. ประวัติการทำงาน',
      count: dccHistoryLogs.length,
      icon: History
    }
  ];

  // Filtered List for Tab 1: PENDING_ISSUE
  const pendingIssueCopies = useMemo(() => {
    return allCopies.filter(c => {
      if (!c) return false;
      const isPending = 
        c.status === 'PENDING_ISSUE' || 
        c.status === 'PENDING_PRINT' || 
        c.status === 'PENDING_DISPATCH';
      if (!isPending) return false;

      const docCode = (c.document_code || c.doc_code || c.code || c.docNo || c.docTitle || '').toLowerCase();
      const docTitleStr = (c.document_title || c.doc_title || c.docName || c.name || c.title || '').toLowerCase();
      const dept = (c.target_department || c.targetDepartment || c.recipientDepartment || c.holder_dept || c.department || '').toLowerCase();
      const loc = (c.location || c.locationName || '').toLowerCase();
      const copyNo = (c.copy_no || c.ccNumber || '').toLowerCase();
      const query = searchTerm.toLowerCase();

      if (searchTerm && !docCode.includes(query) && !docTitleStr.includes(query) && !dept.includes(query) && !loc.includes(query) && !copyNo.includes(query)) {
        return false;
      }
      if (selectedDeptFilter !== 'ALL' && (c.target_department || c.holder_dept || c.department) !== selectedDeptFilter) {
        return false;
      }
      return true;
    });
  }, [allCopies, searchTerm, selectedDeptFilter]);

  // Filtered List for Tab 2: DISPATCHED_TRACKING
  const dispatchedCopies = useMemo(() => {
    return allCopies.filter(c => {
      if (!c) return false;
      const isDispatched = 
        c.status === 'DISPATCHED_PENDING_RECEIPT' || 
        c.status === 'DISPATCHED' || 
        c.status === 'PENDING_RECEIPT' || 
        c.status === 'IN_TRANSIT';
      if (!isDispatched) return false;

      const docCode = (c.document_code || c.doc_code || c.code || c.docNo || c.docTitle || '').toLowerCase();
      const docTitleStr = (c.document_title || c.doc_title || c.docName || c.name || c.title || '').toLowerCase();
      const dept = (c.target_department || c.targetDepartment || c.recipientDepartment || c.holder_dept || c.department || '').toLowerCase();
      const loc = (c.location || c.locationName || '').toLowerCase();
      const copyNo = (c.copy_no || c.ccNumber || '').toLowerCase();
      const query = searchTerm.toLowerCase();

      if (searchTerm && !docCode.includes(query) && !docTitleStr.includes(query) && !dept.includes(query) && !loc.includes(query) && !copyNo.includes(query)) {
        return false;
      }
      if (selectedDeptFilter !== 'ALL' && (c.target_department || c.holder_dept || c.department) !== selectedDeptFilter) {
        return false;
      }
      return true;
    }).sort((a, b) => new Date(b.dispatched_at || 0) - new Date(a.dispatched_at || 0));
  }, [allCopies, searchTerm, selectedDeptFilter]);

  // Grouped Recall Documents for Tab 3: RECALL_CHECKLIST
  const recallGroups = useMemo(() => {
    // Group copies needing recall by document
    const groups = {};

    allCopies.forEach(copy => {
      if (!copy) return;
      // Exclude disposed / voided or already-recorded lost copies
      if (copy.status === 'LOST_VOIDED' || copy.status === 'DISPOSED_LOST' || copy.status === 'DESTROYED' || copy.status === 'ARCHIVED_OBSOLETE') return;
      if (copy.status === 'LOST' || copy.status === 'LOST_RECORDED' || copy.status === 'DECLARED_LOST') return;

      const doc = (documents || []).find(d => String(d.id) === String(copy.doc_id || copy.docId))
        || (externalDocuments || []).find(d => String(d.id) === String(copy.doc_id || copy.docId || copy.external_doc_id));

      const isDocSupersededOrObsolete = Boolean(
        doc && (
          doc.status === 'SUPERSEDED' || 
          doc.status === 'SUPERSEDED_ARCHIVED' || 
          doc.status === 'OBSOLETE' || 
          doc.status === 'OBSOLETE_ARCHIVED' ||
          doc.is_superseded ||
          doc.is_obsolete
        )
      );

      const isNeedingRecall = 
        copy.status === 'SUPERSEDED_PENDING_RECALL' || 
        copy.status === 'PENDING_RECALL' || 
        copy.status === 'DAMAGED_PENDING_RECALL' || 
        copy.status === 'RECALLED' || 
        copy.status === 'OBSOLETE_PENDING_RECALL' || 
        copy.status === 'DAMAGED_PENDING_REPLACEMENT' || 
        ((copy.isDamaged || copy.is_damaged) && copy.status !== 'DESTROYED' && copy.status !== 'RECALLED_DESTROYED' && copy.status !== 'ARCHIVED_OBSOLETE') ||
        (isDocSupersededOrObsolete && (copy.status === 'ACTIVE' || copy.status === 'ISSUED_ACTIVE' || copy.status === 'RECEIVED'));

      if (isNeedingRecall) {
        const docId = String(copy.doc_id || copy.docId || copy.doc_code || copy.docTitle || (doc ? doc.id : 'unknown'));
        if (!groups[docId]) {
          // Find associated recall task if exists
          const recallTask = (tasks || []).find(t => 
            (t.type === 'DCC_RECALL' || t.type === 'DCC_RECALL_WITH_CHECKLIST' || t.type === 'RECALL_HARDCOPY' || t.taskType === 'RECALL' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST') &&
            (String(t.doc_id) === docId || String(t.docId) === docId || String(t.externalDocId) === docId || String(t.darId) === String(doc?.darIdRef) || (doc && (t.title?.includes(doc.title) || t.document_code === doc.title)) || String(t.copyId) === String(copy.id) || String(t.instanceId) === String(copy.id) || (t.supersededCopyIds && t.supersededCopyIds.includes(copy.id)) || (t.doc_code && (t.doc_code === copy.doc_code || t.doc_code === copy.docTitle)))
          );

          const groupDocCode = resolveDocCode(copy, doc);
          const groupDocTitle = resolveDocTitle(copy, doc);

          groups[docId] = {
            docId,
            docCode: (groupDocCode && groupDocCode !== 'DOC-UNKNOWN') ? groupDocCode : (copy.document_code || copy.doc_code || doc?.edCode || doc?.title || 'Unknown Doc'),
            docTitle: (groupDocTitle && groupDocTitle !== groupDocCode) ? groupDocTitle : (copy.document_title || copy.doc_title || copy.docName || doc?.name || copy.docTitle || 'Procedure Document'),
            docVersion: copy.doc_version || copy.rev || doc?.rev || '01',
            docStatus: doc?.status || (copy.isDamaged || copy.status === 'DAMAGED_PENDING_RECALL' || copy.status === 'PENDING_RECALL' || copy.status === 'RECALLED' ? 'DAMAGED_RECALL' : 'SUPERSEDED'),
            taskId: recallTask?.id || `task-recall-${docId}`,
            copies: []
          };
        }
        groups[docId].copies.push(copy);
      }
    });

    return Object.values(groups);
  }, [allCopies, documents, externalDocuments, tasks]);

  // Filtered List for Tab 3: RECALL_CHECKLIST
  const filteredRecallGroups = useMemo(() => {
    return recallGroups.filter(g => {
      const q = (searchTerm || '').trim().toLowerCase();
      const matchSearch = !q ||
        (g.docCode || '').toLowerCase().includes(q) ||
        (g.docTitle || '').toLowerCase().includes(q) ||
        g.copies?.some(c => 
          String(c.copy_no || c.ccNumber || '').toLowerCase().includes(q) ||
          (c.holder_dept || c.department || '').toLowerCase().includes(q) ||
          (c.location || c.locationName || '').toLowerCase().includes(q)
        );
      const matchDept = selectedDeptFilter === 'ALL' ||
        g.copies?.some(c => (c.holder_dept || c.department) === selectedDeptFilter);
      return matchSearch && matchDept;
    });
  }, [recallGroups, searchTerm, selectedDeptFilter]);

  // Raw Active Copies for Tab 4: ACTIVE_REGISTER
  const rawActiveCopies = useMemo(() => {
    return allCopies.filter(c => {
      if (!c) return false;
      if (['PENDING_ISSUE', 'PENDING_PRINT', 'PENDING_DISPATCH', 'DISPATCHED', 'DISPATCHED_PENDING_RECEIPT', 'PENDING_RECEIPT', 'SUPERSEDED_PENDING_RECALL', 'PENDING_RECALL', 'RECALLED_PENDING_DESTRUCTION', 'DESTROYED', 'ARCHIVED_OBSOLETE'].includes(c.status)) return false;
      if (c.is_active_in_field === false || c.is_superseded || c.is_obsolete) return false;
      const isStatusActive = ['IN_USE', 'ISSUED_ACTIVE', 'ACTIVE'].includes(c.status);
      const isFieldActive = c.is_active_in_field === true || (c.is_active_in_field !== false && (Boolean(c.receipt_confirmed_at) || Boolean(c.received_at)));
      return isStatusActive && isFieldActive;
    });
  }, [allCopies]);

  // Group active copies by document code (Master-Detail Accordion)
  const activeDocGroups = useMemo(() => {
    const groups = {};

    rawActiveCopies.forEach(copy => {
      if (!copy) return;
      const doc = resolveCopyDoc(copy, documents, externalDocuments);
      const docCode = resolveDocCode(copy, doc);
      const docId = String(copy.doc_id || copy.docId || (doc ? doc.id : docCode));
      const groupKey = docCode || docId;

      if (!groups[groupKey]) {
        const docTitle = resolveDocTitle(copy, doc);
        const docVersion = resolveDocVersion(copy, doc);
        const ownerDept = resolveOwnerDept(copy, doc);

        groups[groupKey] = {
          key: groupKey,
          docId,
          docCode,
          docTitle,
          docVersion,
          ownerDept,
          copies: []
        };
      }

      // Deduplicate copies within group by normalized copy number
      const copyNoNormalized = String(copy.copy_no || copy.copyNo || copy.ccNumber || copy.id).replace(/\D/g, '') || copy.id;
      const alreadyInGroup = groups[groupKey].copies.some(existing => {
        const existingNo = String(existing.copy_no || existing.copyNo || existing.ccNumber || existing.id).replace(/\D/g, '') || existing.id;
        return existingNo === copyNoNormalized || existing.id === copy.id;
      });
      if (!alreadyInGroup) {
        groups[groupKey].copies.push(copy);
      }
    });

    // Sort copies within each group by copy_no ascending (e.g. 01, 02)
    Object.values(groups).forEach(g => {
      g.copies.sort((a, b) => {
        const numA = parseInt(String(a.copy_no || a.ccNumber || '0').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.copy_no || b.ccNumber || '0').replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });
    });

    // Return groups sorted alphabetically by document code
    return Object.values(groups).sort((a, b) => (a.docCode || '').localeCompare(b.docCode || ''));
  }, [rawActiveCopies, documents, externalDocuments]);

  // Filtered Groups for Tab 4: ACTIVE_REGISTER
  const filteredActiveDocGroups = useMemo(() => {
    return activeDocGroups.filter(g => {
      const q = (searchTerm || '').trim().toLowerCase();

      // Department filter: matches if document ownerDept is selected OR any copy's holder department matches
      const matchDept = selectedDeptFilter === 'ALL' ||
        g.ownerDept === selectedDeptFilter ||
        g.copies.some(c => (c.holder_dept || c.department) === selectedDeptFilter);

      if (!matchDept) return false;
      if (!q) return true;

      // Search matching: docCode, docTitle, ownerDept, or any copy's copy_no, location, holder_dept, receiver
      const matchDoc = (g.docCode || '').toLowerCase().includes(q) ||
        (g.docTitle || '').toLowerCase().includes(q) ||
        (g.ownerDept || '').toLowerCase().includes(q);

      if (matchDoc) return true;

      const matchCopies = g.copies.some(c => {
        const copyNo = String(c.copy_no || c.ccNumber || '').toLowerCase();
        const holderDept = String(c.holder_dept || c.department || '').toLowerCase();
        const loc = String(c.location || c.locationName || c.station_name || '').toLowerCase();
        const receiver = String(c.receipt_confirmed_by || '').toLowerCase();
        return copyNo.includes(q) || holderDept.includes(q) || loc.includes(q) || receiver.includes(q);
      });

      return matchCopies;
    });
  }, [activeDocGroups, searchTerm, selectedDeptFilter]);

  // Filtered Active Copies flattened (keeps backward-compatible count & access)
  const activeCopies = useMemo(() => {
    return filteredActiveDocGroups.flatMap(g => g.copies);
  }, [filteredActiveDocGroups]);

  // Accordion expansion state for Tab 4
  const [expandedDocKeys, setExpandedDocKeys] = useState(() => new Set());

  const toggleExpandDoc = (groupKey) => {
    setExpandedDocKeys(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const allExpanded = filteredActiveDocGroups.length > 0 && filteredActiveDocGroups.every(g => expandedDocKeys.has(g.key));

  const toggleAllDocs = () => {
    if (allExpanded) {
      setExpandedDocKeys(new Set());
    } else {
      setExpandedDocKeys(new Set(filteredActiveDocGroups.map(g => g.key)));
    }
  };

  // Auto-expand all filtered groups when searching
  React.useEffect(() => {
    if (searchTerm && searchTerm.trim()) {
      setExpandedDocKeys(new Set(filteredActiveDocGroups.map(g => g.key)));
    }
  }, [searchTerm, filteredActiveDocGroups]);

  // Tab 5: Audit Trail filter
  const filteredAuditLogs = useMemo(() => {
    return (dccHistoryLogs || []).filter(log => {
      if (!auditSearchTerm) return true;
      const q = auditSearchTerm.toLowerCase();
      const userStr = String(typeof log.performed_by === 'object' ? JSON.stringify(log.performed_by) : (log.performed_by || '')).toLowerCase();
      const actionStr = String(typeof log.action === 'object' ? JSON.stringify(log.action) : (log.action || '')).toLowerCase();
      const docStr = String(typeof log.document_code === 'object' ? JSON.stringify(log.document_code) : (log.document_code || '')).toLowerCase();
      const ccStr = String(log.copy_number || '').toLowerCase();
      const detailsStr = String(typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || '')).toLowerCase();

      return (
        userStr.includes(q) ||
        actionStr.includes(q) ||
        docStr.includes(q) ||
        ccStr.includes(q) ||
        detailsStr.includes(q)
      );
    });
  }, [dccHistoryLogs, auditSearchTerm]);

  // Dedicated Disposition Ledger Filter
  const filteredDispositionRecords = useMemo(() => {
    const records = copyDispositionRecords || [];
    if (!dispositionSearchTerm) return records;
    const q = dispositionSearchTerm.toLowerCase();
    return records.filter(r => {
      const code = String(r.docCode || '').toLowerCase();
      const title = String(r.docTitle || '').toLowerCase();
      const copyNo = String(r.copyNumber || r.copy_no || '').toLowerCase();
      const dept = String(r.department || '').toLowerCase();
      const loc = String(r.location || '').toLowerCase();
      const by = String(r.disposedBy || r.disposed_by_name || '').toLowerCase();
      const notes = String(r.notes || '').toLowerCase();
      const ref = String(r.referenceNo || r.reference_no || '').toLowerCase();
      const witness = String(r.witnessName || r.witness_name || '').toLowerCase();
      return (
        code.includes(q) ||
        title.includes(q) ||
        copyNo.includes(q) ||
        dept.includes(q) ||
        loc.includes(q) ||
        by.includes(q) ||
        notes.includes(q) ||
        ref.includes(q) ||
        witness.includes(q)
      );
    });
  }, [copyDispositionRecords, dispositionSearchTerm]);

  // Universal Pagination Hook Instances for all tabs
  const pendingIssuePagination = useTablePagination(pendingIssueCopies, 10);
  const dispatchedPagination = useTablePagination(dispatchedCopies, 10);
  const activePagination = useTablePagination(filteredActiveDocGroups, 10);
  const auditPagination = useTablePagination(filteredAuditLogs, 10);
  const dispositionPagination = useTablePagination(filteredDispositionRecords, 10);

  // Export Disposition Ledger to CSV (ISO 9001 Compliance)
  const handleExportDispositionCsv = () => {
    if (!filteredDispositionRecords || filteredDispositionRecords.length === 0) {
      toast.error('ไม่มีข้อมูล Disposition Ledger ที่ตรงกับเงื่อนไขในการ Export');
      return;
    }
    const headers = ['Timestamp,Document Code,Title,Rev,Copy No,Department,Location,Disposition Type,Method,Disposed By,Witness,Reference No,Notes'];
    const rows = filteredDispositionRecords.map(r => {
      const timeStr = r.disposedAt ? new Date(r.disposedAt).toLocaleString('th-TH') : '-';
      return `"${timeStr}","${r.docCode || ''}","${(r.docTitle || '').replace(/"/g, '""')}","${r.revision || ''}","${r.copyNumber || ''}","${r.department || ''}","${r.location || ''}","${r.dispositionType || ''}","${r.dispositionMethod || ''}","${r.disposedBy || ''}","${r.witnessName || ''}","${r.referenceNo || ''}","${(r.notes || '').replace(/"/g, '""')}"`;
    });
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.concat(rows).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Controlled_Copy_Disposition_Ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export ทะเบียนประวัติการทำลายสำเนา (Disposition Ledger) สำเร็จ');
  };

  // Export to CSV
  const handleExportAuditCsv = () => {
    if (filteredAuditLogs.length === 0) {
      toast.error('ไม่มีข้อมูล Audit Trail ที่ตรงกับเงื่อนไขในการ Export');
      return;
    }
    const headers = ['Timestamp,User,Action,Document,CC Number,Details'];
    const rows = filteredAuditLogs.map(log => {
      const timeStr = log?.timestamp ? (() => {
        try {
          const d = new Date(log.timestamp);
          return isNaN(d.getTime()) ? String(log.timestamp) : d.toLocaleString('th-TH');
        } catch {
          return String(log.timestamp || '-');
        }
      })() : '-';
      const actorStr = typeof log?.performed_by === 'object' ? JSON.stringify(log?.performed_by) : (log?.performed_by || '-');
      const actionStr = typeof log?.action === 'object' ? JSON.stringify(log?.action) : (log?.action || '-');
      const docStr = typeof log?.document_code === 'object' ? JSON.stringify(log?.document_code) : (log?.document_code || '-');
      const ccStr = log?.copy_number ? `Copy ${log.copy_number}` : '-';
      const detailsStr = typeof log?.details === 'object' ? JSON.stringify(log?.details) : (log?.details || '-');
      return `"${timeStr}","${actorStr}","${actionStr}","${docStr}","${ccStr}","${detailsStr.replace(/"/g, '""')}"`;
    });
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.concat(rows).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Controlled_Copy_Audit_Trail_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export Audit Trail สำเร็จ');
  };

  // --- ACTIONS ---

  // 1. Single Print with Location-Specific Watermark (also tracks is_printed state)
  const handlePrintSingleCopy = async (item) => {
    setProcessingCopyId(item.id);
    const rawCopy = item.copyNo || item.copy_no || item.copyNumber || item.ccNumber || '01';
    const copyMatch = String(rawCopy).match(/\d+/);
    const cleanCopyNo = copyMatch ? copyMatch[0].padStart(2, '0') : String(rawCopy).padStart(2, '0');

    const toastId = toast.loading(`กำลังประทับลายน้ำ CONTROLLED COPY สำหรับ ${item.docCode || item.doc_code || item.docTitle || 'Document'} (Copy ${cleanCopyNo})...`);
    try {
      // 1. ดึงข้อมูล Master Document ที่สอดคล้องกับ item
      const targetDoc = (documents || []).find(d => 
        String(d.id) === String(item.docId || item.doc_id) ||
        (d.code && (d.code === item.docCode || d.code === item.doc_code)) ||
        (d.docCode && (d.docCode === item.docCode || d.docCode === item.doc_code))
      ) || (externalDocuments || []).find(d => 
        String(d.id) === String(item.docId || item.doc_id || item.external_doc_id) ||
        (d.code && (d.code === item.docCode || d.code === item.doc_code)) ||
        (d.docCode && (d.docCode === item.docCode || d.docCode === item.doc_code))
      ) || {
        id: item.docId || item.doc_id || item.id,
        title: item.docCode || item.doc_code || item.docTitle || 'SOP-QMS-001',
        code: item.docCode || item.doc_code || item.docTitle || 'SOP-QMS-001',
        name: item.docName || item.docTitle || 'Controlled Standard Procedure',
        revision: item.revNo ?? item.doc_version ?? item.rev ?? '00',
        department: item.recipientDept || item.department || item.holderDept || item.holder_dept || 'DCC',
        effectiveDate: item.issuedDate || item.dispatchDate || item.dateIssued || formatQmsDate(new Date())
      };

      // 2. Format Issue No. ให้เป็นตัวเลข 2 หลัก
      const rawIssue = item.issueNo || item.issue_no || item.issueNumber || '01';
      const issueMatch = String(rawIssue).match(/\d+/);
      const cleanIssueNo = issueMatch ? issueMatch[0].padStart(2, '0') : '01';

      const holderDept = item.recipientDept || item.department || item.holderDept || item.holder_dept || '-';
      const location = item.location || item.pointOfUse || item.targetLocation || item.locationName || item.station_name || '-';
      const issuedDate = item.issuedDate || item.dispatchDate || item.dateIssued || formatQmsDate(new Date());

      const docCode = targetDoc.code || targetDoc.docCode || item.docCode || item.doc_code || item.document_code || item.docTitle || targetDoc.title || 'DOC-001';
      const revNo = targetDoc.revision ?? targetDoc.revNo ?? targetDoc.rev ?? item.revNo ?? item.doc_version ?? item.rev ?? '00';

      const isExternal = Boolean(item.is_external || item.isExternal || targetDoc.isExternal || targetDoc.docType === 'ED' || (docCode || '').startsWith('ED-'));

      // 3. เรียก Watermark Service โหมด CONTROLLED
      await UniversalWatermarkService.downloadWatermarkedPdf(targetDoc, WATERMARK_TYPES.CONTROLLED_COPY, {
        currentUser,
        docCode,
        docTitle: targetDoc.title || targetDoc.docTitle || targetDoc.name || item.docName || '',
        sourceVersion: targetDoc.sourceVersion || targetDoc.edition,
        source: targetDoc.source,
        isExternal,
        is_external: isExternal,
        doc_type: isExternal ? 'ED' : (targetDoc.type || targetDoc.docType || 'SOP'),
        revNo,
        docVersion: revNo,
        copyNo: cleanCopyNo,
        issueNo: cleanIssueNo,
        holderDept,
        recipientDept: holderDept,
        location,
        loc: location,
        issuedDate,
        isControlledPrint: true,
        is_replacement: Boolean(item.is_replacement || item.isReplacement || cleanIssueNo !== '01')
      });

      // 4. อัปเดต print state ใน store (Poka-Yoke: ติดตามการพิมพ์)
      if (markCopyPrinted) markCopyPrinted(item.id);

      toast.success(`ดาวน์โหลดเอกสารพร้อมลายน้ำ Copy ${cleanCopyNo} สำเร็จ`, { id: toastId });
    } catch (err) {
      console.error('Failed to print controlled copy:', err);
      toast.error('ไม่สามารถพิมพ์สำเนาควบคุมได้', { id: toastId });
    } finally {
      setProcessingCopyId(null);
    }
  };

  // 2. Batch Print All Pending Copies
  const handleBatchPrint = async () => {
    const targets = selectedCopyIds.length > 0
      ? pendingIssueCopies.filter(c => selectedCopyIds.includes(c.id))
      : pendingIssueCopies;

    if (targets.length === 0) {
      toast.error('ไม่พบรายการสำเนาที่ต้องการพิมพ์');
      return;
    }

    setIsBatchPrinting(true);
    const toastId = toast.loading(`กำลังประมวลผลการพิมพ์ทั้งหมด ${targets.length} ฉบับพร้อมลายน้ำตามจุดใช้งาน...`);

    try {
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        if (!item) continue;
        const targetDoc = (documents || []).find(d => 
          String(d.id) === String(item.docId || item.doc_id) ||
          (d.code && (d.code === item.docCode || d.code === item.doc_code)) ||
          (d.docCode && (d.docCode === item.docCode || d.docCode === item.doc_code))
        ) || (externalDocuments || []).find(d => 
          String(d.id) === String(item.docId || item.doc_id || item.external_doc_id) ||
          (d.code && (d.code === item.docCode || d.code === item.doc_code)) ||
          (d.docCode && (d.docCode === item.docCode || d.docCode === item.doc_code))
        ) || {
          id: item.docId || item.doc_id || item.id,
          title: item.docCode || item.doc_code || item.docTitle || 'SOP-QMS-001',
          code: item.docCode || item.doc_code || item.docTitle || 'SOP-QMS-001',
          name: item.docName || item.docTitle || 'Controlled Standard Procedure',
          revision: item.revNo ?? item.doc_version ?? item.rev ?? '00',
          department: item.recipientDept || item.department || item.holderDept || item.holder_dept || 'DCC',
          effectiveDate: item.issuedDate || item.dispatchDate || item.dateIssued || formatQmsDate(new Date())
        };

        const rawCopy = item.copyNo || item.copy_no || item.copyNumber || item.ccNumber || '01';
        const copyMatch = String(rawCopy).match(/\d+/);
        const cleanCopyNo = copyMatch ? copyMatch[0].padStart(2, '0') : String(rawCopy).padStart(2, '0');

        const rawIssue = item.issueNo || item.issue_no || item.issueNumber || '01';
        const issueMatch = String(rawIssue).match(/\d+/);
        const cleanIssueNo = issueMatch ? issueMatch[0].padStart(2, '0') : '01';

        const holderDept = item.recipientDept || item.department || item.holderDept || item.holder_dept || '-';
        const location = item.location || item.pointOfUse || item.targetLocation || item.locationName || item.station_name || '-';
        const issuedDate = item.issuedDate || item.dispatchDate || item.dateIssued || formatQmsDate(new Date());

        const docCode = targetDoc.code || targetDoc.docCode || item.docCode || item.doc_code || item.document_code || item.docTitle || targetDoc.title || 'DOC-001';
        const revNo = targetDoc.revision ?? targetDoc.revNo ?? targetDoc.rev ?? item.revNo ?? item.doc_version ?? item.rev ?? '00';

        const isExternal = Boolean(item.is_external || item.isExternal || targetDoc.isExternal || targetDoc.docType === 'ED' || (docCode || '').startsWith('ED-'));

        await UniversalWatermarkService.downloadWatermarkedPdf(targetDoc, WATERMARK_TYPES.CONTROLLED_COPY, {
          currentUser,
          docCode,
          docTitle: targetDoc.title || targetDoc.docTitle || targetDoc.name || item.docName || '',
          sourceVersion: targetDoc.sourceVersion || targetDoc.edition,
          source: targetDoc.source,
          isExternal,
          is_external: isExternal,
          doc_type: isExternal ? 'ED' : (targetDoc.type || targetDoc.docType || 'SOP'),
          revNo,
          docVersion: revNo,
          copyNo: cleanCopyNo,
          issueNo: cleanIssueNo,
          holderDept,
          recipientDept: holderDept,
          location,
          loc: location,
          issuedDate,
          isControlledPrint: true,
          is_replacement: Boolean(item.is_replacement || item.isReplacement || cleanIssueNo !== '01')
        });

        // Update print tracking state in store
        if (markCopyPrinted) markCopyPrinted(item.id);

        // Small pause between downloads to prevent browser pop-up blocking
        if (i < targets.length - 1) {
          await new Promise(r => setTimeout(r, 400));
        }
      }
      toast.success(`พิมพ์สำเนาควบคุมครบทั้ง ${targets.length} ฉบับเรียบร้อยแล้ว`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการพิมพ์แบบกลุ่ม', { id: toastId });
    } finally {
      setIsBatchPrinting(false);
    }
  };

  // 3. Dispatch Guard (Poka-Yoke): ตรวจสอบว่าพิมพ์แล้วก่อนส่งมอบ
  const handleDispatchClick = (copy) => {
    if (!copy.is_printed) {
      // ยังไม่พิมพ์ -> เปิด Warning Modal
      setUnprintedWarningModal({ isOpen: true, targetItem: copy });
      return;
    }
    // พิมพ์แล้ว -> ดำเนินการส่งมอบตามปกติ
    dispatchControlledCopy(copy.id);
    toast.success(`บันทึกส่งมอบสำเนา Copy ${copy.copy_no || copy.ccNumber} (${copy.holder_dept || copy.department}) สำเร็จ พร้อมสร้าง Task ตรวจรับ`);
  };

  // 3a. Print-then-Dispatch (จาก Warning Modal)
  const handlePrintAndDispatch = async (item) => {
    setUnprintedWarningModal({ isOpen: false, targetItem: null });
    await handlePrintSingleCopy(item);
    dispatchControlledCopy(item.id);
    toast.success(`พิมพ์และบันทึกส่งมอบสำเนา Copy ${item.copy_no || item.ccNumber} สำเร็จ`);
  };

  // 3b. Force-Dispatch โดยข้ามการพิมพ์ (จาก Warning Modal)
  const handleForceDispatch = (item) => {
    setUnprintedWarningModal({ isOpen: false, targetItem: null });
    dispatchControlledCopy(item.id);
    toast(`บันทึกส่งมอบสำเนา Copy ${item.copy_no || item.ccNumber} (ข้ามการพิมพ์)`, { icon: '⚠️' });
  };

  // 4. Batch Dispatch All Pending Copies
  const handleBatchDispatch = () => {
    const targets = selectedCopyIds.length > 0
      ? pendingIssueCopies.filter(c => selectedCopyIds.includes(c.id))
      : pendingIssueCopies;

    if (targets.length === 0) {
      toast.error('ไม่พบรายการสำเนาที่ต้องการส่งมอบ');
      return;
    }

    setIsBatchDispatching(true);
    try {
      targets.forEach(copy => {
        dispatchControlledCopy(copy.id);
      });
      setSelectedCopyIds([]);
      toast.success(`บันทึกส่งมอบเอกสารครบทั้ง ${targets.length} ฉบับแล้ว (ส่ง Task ไปยังแผนกผู้รับเรียบร้อย)`);
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการส่งมอบแบบกลุ่ม');
    } finally {
      setIsBatchDispatching(false);
    }
  };

  // 5. Quick-toggle physical copy receipt at DCC (Step 1 <-> Step 2)
  const handleToggleRecallReceived = (copy) => {
    if (!copy) return;
    const isCurrentlyReceived = copy.status === 'RECALLED' || copy.status === 'RECEIVED_AT_DCC' || copy.status === 'RECALLED_HELD_AT_DCC';
    toggleCopyRecallReceived(copy.id);
    if (!isCurrentlyReceived) {
      toast.success(`ตรวจรับเล่มจริง Copy ${copy.copy_no || copy.ccNumber || '01'} เข้าสู่ DCC เรียบร้อยแล้ว (รอทำลาย/จัดเก็บ)`, { id: `rc-${copy.id}` });
    } else {
      toast(`ยกเลิกการตรวจรับเล่ม Copy ${copy.copy_no || copy.ccNumber || '01'} (กลับสู่สถานะรอเก็บเล่ม)`, { id: `rc-${copy.id}` });
    }
  };

  // 7. Manual Issue Extra Copy
  const handleIssueSubmit = (e) => {
    e.preventDefault();
    if (!issueDoc) {
      toast.error('กรุณาเลือกรหัสเอกสาร');
      return;
    }
    issueControlledCopy(issueDoc, issueDept || 'PD', issueLocation || undefined);
    setIssueModalOpen(false);
    setIssueDoc('');
    setIssueDept('');
    setIssueLocation('');
    toast.success(`ออกสำเนาใหม่สำหรับ ${issueDoc} สำเร็จ`);
  };

  // 8. Report Damaged / Lost
  const handleReportSubmit = async (e) => {
    e.preventDefault();
    const trimmedReason = reportReason.trim();
    if (!trimmedReason) {
      toast.error('กรุณาระบุสาเหตุและความจำเป็น');
      return;
    }
    if ((await reportCcDamagedLost(selectedInstance.id, reportType, trimmedReason)) === false) return;
    setReportModalOpen(false);
    setSelectedInstance(null);
    setReportReason('');
    toast.success('ยื่นคำร้องขอสำเนาทดแทนเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่ DCC จัดพิมพ์และส่งมอบ');
  };

  // Selection Toggles
  const handleSelectAllPending = () => {
    if (selectedCopyIds.length === pendingIssueCopies.length) {
      setSelectedCopyIds([]);
    } else {
      setSelectedCopyIds(pendingIssueCopies.map(c => c.id));
    }
  };

  const handleToggleSelectCopy = (id) => {
    setSelectedCopyIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-4 pb-16 max-w-7xl mx-auto w-full max-w-full overflow-hidden">
      {/* Top Header - Standardized Page Header */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs">
        <div className="flex items-center gap-3">
          <Copy className="w-5 h-5 text-slate-700 shrink-0" strokeWidth={1.75} />
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              ทะเบียนสำเนาควบคุม
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold font-mono bg-blue-50 text-[#0D99FF] border border-blue-100">
              ISO 9001 / FSSC 22000
            </span>
          </div>
        </div>

        {/* Quick Action Button */}
        <button
          type="button"
          onClick={() => setIssueModalOpen(true)}
          className="h-9 px-3.5 text-xs font-bold text-white bg-[#0D99FF] hover:bg-[#007BE5] rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <PlusCircle size={15} /> <span>ออกสำเนาใหม่</span>
        </button>
      </div>

      {/* Modern Segmented Control / Compact Pill Tabs (height <= 44px) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 p-1 bg-slate-100/80 border border-slate-200/80 rounded-xl mb-3">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id || (tab.aliases && tab.aliases.includes(activeTab));
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center justify-between px-3.5 py-2.5 md:py-2 rounded-lg transition-all cursor-pointer ${
                isActive
                  ? 'bg-white border border-[#0D99FF]/40 text-[#0D99FF] font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {/* px-3.5 py-3 rounded-lg transition-all cursor-pointer */}
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <TabIcon size={15} strokeWidth={1.5} className={isActive ? 'text-[#0D99FF]' : 'text-slate-400'} />
                <span className="text-sm truncate font-medium">{tab.label}</span>
                <span className="sr-only">{tab.legacyLabel}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full font-mono text-xs shrink-0 ${
                isActive 
                  ? 'bg-[#E5F4FF] text-[#0D99FF] font-bold' 
                  : 'bg-slate-200/80 text-slate-600 font-semibold'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: รายการรอออกสำเนา (PENDING_ISSUE) */}
      {/* ========================================================================= */}
      {(activeTab === 'PENDING_ISSUE' || activeTab === 'PENDING_PRINT') && (
        <div className="w-full bg-white rounded-xl border border-[#E5E5E5] shadow-2xs overflow-hidden h-auto">
          {/* Unified Action Toolbar */}
          <div className="p-3 border-b border-[#E5E5E5] flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-white">
            {/* Left: Compact Search & Department Select */}
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="ค้นหารหัส, ชื่อเอกสาร, หมายเลขสำเนา..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 h-9 text-xs bg-white border border-[#E5E5E5] rounded-lg focus:border-[#0D99FF] focus:ring-1 focus:ring-[#0D99FF] outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="px-2.5 py-1.5 h-9 text-xs bg-white border border-[#E5E5E5] rounded-lg font-medium text-slate-700 focus:outline-none focus:border-[#0D99FF] shrink-0"
              >
                <option value="ALL">ทุกแผนก</option>
                {departmentList.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Right: Items Count & Action Buttons */}
            <div className="flex items-center gap-2 justify-end shrink-0">
              <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
                {pendingIssueCopies.length} รายการ
              </span>

              <button
                onClick={handleBatchPrint}
                disabled={isBatchPrinting || pendingIssueCopies.length === 0}
                className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isBatchPrinting ? (
                  <div className="w-3.5 h-3.5 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Printer size={14} />
                )}
                {selectedCopyIds.length > 0 ? `พิมพ์ที่เลือก (${selectedCopyIds.length})` : 'พิมพ์ทั้งหมด (Batch Print All)'}
              </button>

              <button
                onClick={handleBatchDispatch}
                disabled={isBatchDispatching || pendingIssueCopies.length === 0}
                className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isBatchDispatching ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                {selectedCopyIds.length > 0 ? `ส่งมอบที่เลือก (${selectedCopyIds.length})` : 'บันทึกส่งมอบทั้งหมด'}
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="w-full bg-white rounded-xl border border-[#E2E8F0] shadow-2xs overflow-hidden flex flex-col min-h-0 h-auto">
            <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full scrollbar-thin">
              <table className="w-full text-left text-sm text-[#1E293B] border-collapse">
                <thead className="bg-[#F8FAFC] text-[#374151] uppercase font-bold text-xs tracking-wider border-b border-[#E2E8F0] sticky top-0 z-10 shadow-xs backdrop-blur-sm whitespace-nowrap">
                  <tr>
                    <th className="py-3 px-3.5 w-12 text-center select-none bg-[#F8FAFC]">
                      <input
                        type="checkbox"
                        checked={pendingIssueCopies.length > 0 && selectedCopyIds.length === pendingIssueCopies.length}
                        onChange={handleSelectAllPending}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />
                    </th>
                    <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">รหัสเอกสาร / ชื่อเอกสาร</th>
                    <th className="py-3 px-3.5 text-center select-none whitespace-nowrap bg-[#F8FAFC]">ฉบับ (Rev.)</th>
                    <th className="py-3 px-3.5 text-center select-none whitespace-nowrap bg-[#F8FAFC]">หมายเลขสำเนา</th>
                    <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">แผนกผู้รับ</th>
                    <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">จุดใช้งาน (Location)</th>
                    <th className="py-3 px-3.5 text-right select-none whitespace-nowrap bg-[#F8FAFC]">การดำเนินการ (Actions)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  <AnimatePresence>
                    {pendingIssuePagination.paginatedData.map((copy) => {
                      const isSelected = selectedCopyIds.includes(copy.id);
                      const isProcessing = processingCopyId === copy.id;
                      const linkedDoc = resolveCopyDoc(copy, documents, externalDocuments);
                      const rawCode = copy.document_code || copy.doc_code || copy.code || copy.docNo;
                      const resolvedCode = (!isThaiText(rawCode) && rawCode) ? rawCode : resolveDocCode(copy, linkedDoc);
                      const itemDocCode = (resolvedCode && resolvedCode !== 'DOC-UNKNOWN') ? resolvedCode : (rawCode || '-');

                      const rawTitle = copy.document_title || copy.doc_title || copy.docName || (copy.title !== itemDocCode ? copy.title : null) || (copy.docTitle !== itemDocCode ? copy.docTitle : null);
                      const resolvedTitle = resolveDocTitle(copy, linkedDoc);
                      let itemDocTitle = rawTitle || (resolvedTitle && resolvedTitle !== itemDocCode ? resolvedTitle : null) || linkedDoc?.name || linkedDoc?.document_name || copy.docName || copy.docTitle || '-';
                      if (itemDocTitle === itemDocCode && (linkedDoc?.name || linkedDoc?.document_name)) {
                        itemDocTitle = linkedDoc.name || linkedDoc.document_name;
                      }

                      return (
                        <motion.tr
                          key={copy.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={`hover:bg-slate-50/70 border-b border-slate-100 transition-colors ${isSelected ? 'bg-[#F1F5F9]' : ''}`}
                        >
                          <td className="py-3.5 px-3.5 w-10 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectCopy(copy.id)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3.5 px-3.5 align-middle">
                            <div className="flex flex-col items-start">
                              {/* 1. กล่องรหัสเอกสาร (Badge สีฟ้า) */}
                              <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-xs inline-block">
                                {itemDocCode}
                              </span>
                              
                              {/* 2. ชื่อเอกสาร (ข้อความปกติสีเข้ม) */}
                              <span className="text-xs font-medium text-slate-700 mt-1 line-clamp-1 max-w-[200px] xl:max-w-xs" title={itemDocTitle}>
                                {itemDocTitle}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3.5 text-center align-middle whitespace-nowrap">
                            <span className="text-xs font-mono font-semibold text-slate-700">
                              Rev.{copy.doc_version || copy.rev || '00'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5 text-center align-middle whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              <span className="px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs inline-block">
                                Copy {copy.copy_no || copy.ccNumber || '01'}
                              </span>
                              {(copy.is_replacement || (copy.issue_no && copy.issue_no !== '01')) && (
                                <span className="px-2 py-0.5 rounded-md bg-[#FFF8E6] text-[#B87C33] font-semibold border border-[#FDE6B0] text-xs whitespace-nowrap font-sans">
                                  Issue {copy.issue_no || '02'} (ทดแทน)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-3.5 align-middle whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{copy.holder_dept || copy.department}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3.5 align-middle">
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 line-clamp-1 max-w-xs" title={copy.location || copy.locationName || copy.station_name || `${copy.holder_dept || copy.department || 'PD'} Head Office`}>
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{copy.location || copy.locationName || copy.station_name || `${copy.holder_dept || copy.department || 'PD'} Head Office`}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3.5 align-middle text-right whitespace-nowrap">
                            <div className="flex flex-col items-end gap-1.5">
                              {/* Print-status badge */}
                              {copy.is_printed ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Check className="w-3 h-3" />
                                  พิมพ์แล้ว
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                  <AlertTriangle className="w-3 h-3" />
                                  ยังไม่ได้พิมพ์
                                </span>
                              )}
                              {/* Action buttons: hierarchy swaps based on is_printed */}
                              <div className="inline-flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => handlePrintSingleCopy(copy)}
                                  disabled={isProcessing}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                                    !copy.is_printed
                                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  }`}
                                  title="พิมพ์สำเนาพร้อมลายน้ำระบุจุดใช้งาน"
                                >
                                  {isProcessing ? (
                                    <div className={`w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin ${!copy.is_printed ? 'border-white' : 'border-slate-600'}`} />
                                  ) : (
                                    <Printer className="w-3.5 h-3.5" />
                                  )}
                                  <span>{copy.is_printed ? 'พิมพ์อีกครั้ง' : 'พิมพ์สำเนา'}</span>
                                </button>

                                <button
                                  onClick={() => handleDispatchClick(copy)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shadow-xs transition-all cursor-pointer ${
                                    copy.is_printed
                                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                                  }`}
                                  title="บันทึกส่งมอบเล่มจริงให้แผนกผู้รับ"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>บันทึกส่งมอบ</span>
                                </button>
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                  {pendingIssuePagination.paginatedData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        <CheckCircle2 className="mx-auto text-emerald-400 mb-2" size={36} />
                        <div className="font-bold text-slate-700 text-base">ไม่มีรายการค้างออกสำเนา</div>
                        <p className="text-xs text-slate-400 mt-1">สำเนาที่อนุมัติได้รับการพิมพ์และบันทึกส่งมอบครบถ้วนแล้ว</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={pendingIssuePagination.currentPage}
              totalItems={pendingIssuePagination.totalItems}
              pageSize={pendingIssuePagination.pageSize}
              onPageChange={pendingIssuePagination.setCurrentPage}
              onPageSizeChange={pendingIssuePagination.setPageSize}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ติดตามการส่งมอบ (DISPATCHED_TRACKING) */}
      {/* ========================================================================= */}
      {(activeTab === 'DISPATCHED_TRACKING' || activeTab === 'DISPATCHED') && (
        <div className="w-full bg-white rounded-xl border border-[#E5E5E5] shadow-2xs overflow-hidden h-auto">
          {/* Unified Action Toolbar */}
          <div className="p-3 border-b border-[#E5E5E5] flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-white">
            {/* Left: Compact Search & Department Select */}
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="ค้นหารหัส, ชื่อเอกสาร, หมายเลขสำเนา..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 h-9 text-xs bg-white border border-[#E5E5E5] rounded-lg focus:border-[#0D99FF] focus:ring-1 focus:ring-[#0D99FF] outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="px-2.5 py-1.5 h-9 text-xs bg-white border border-[#E5E5E5] rounded-lg font-medium text-slate-700 focus:outline-none focus:border-[#0D99FF] shrink-0"
              >
                <option value="ALL">ทุกแผนก</option>
                {departmentList.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Right: Items Count & Status */}
            <div className="flex items-center gap-2 justify-end shrink-0">
              <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
                รอตรวจรับ {dispatchedCopies.length} รายการ
              </span>
              <span className="sr-only">ติดตามการส่งมอบและรอตรวจรับ ({dispatchedCopies.length} รายการ)</span>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full scrollbar-thin">
            <table className="w-full text-left text-sm text-[#1E293B] border-collapse">
              <thead className="bg-[#F8FAFC] text-[#374151] uppercase font-bold text-xs tracking-wider border-b border-[#E2E8F0] sticky top-0 z-10 shadow-xs backdrop-blur-sm whitespace-nowrap">
                <tr>
                  <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">รหัสเอกสาร / ชื่อเอกสาร</th>
                  <th className="py-3 px-3.5 text-center select-none whitespace-nowrap bg-[#F8FAFC]">ฉบับ (Rev.)</th>
                  <th className="py-3 px-3.5 text-center select-none whitespace-nowrap bg-[#F8FAFC]">หมายเลขสำเนา</th>
                  <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">แผนกผู้รับ</th>
                  <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">จุดใช้งาน (Location)</th>
                  <th className="py-3 px-3.5 text-center select-none whitespace-nowrap bg-[#F8FAFC]">สถานะ</th>
                  <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">วันเวลาที่นำส่ง</th>
                  <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">ผู้นำส่ง (DCC)</th>
                  <th className="py-3 px-3.5 text-right select-none whitespace-nowrap bg-[#F8FAFC]">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {dispatchedPagination.paginatedData.map((copy) => {
                  const linkedDoc = resolveCopyDoc(copy, documents, externalDocuments);
                  const rawCode = copy.document_code || copy.doc_code || copy.code || copy.docNo;
                  const resolvedCode = (!isThaiText(rawCode) && rawCode) ? rawCode : resolveDocCode(copy, linkedDoc);
                  const itemDocCode = (resolvedCode && resolvedCode !== 'DOC-UNKNOWN') ? resolvedCode : (rawCode || '-');

                  const rawTitle = copy.document_title || copy.doc_title || copy.docName || (copy.title !== itemDocCode ? copy.title : null) || (copy.docTitle !== itemDocCode ? copy.docTitle : null);
                  const resolvedTitle = resolveDocTitle(copy, linkedDoc);
                  let itemDocTitle = rawTitle || (resolvedTitle && resolvedTitle !== itemDocCode ? resolvedTitle : null) || linkedDoc?.name || linkedDoc?.document_name || copy.docName || copy.docTitle || '-';
                  if (itemDocTitle === itemDocCode && (linkedDoc?.name || linkedDoc?.document_name)) {
                    itemDocTitle = linkedDoc.name || linkedDoc.document_name;
                  }

                  return (
                    <tr key={copy.id} className="hover:bg-slate-50/70 border-b border-slate-100 transition-colors">
                      <td className="py-3.5 px-3.5 align-middle">
                        <div className="flex flex-col items-start">
                          {/* 1. กล่องรหัสเอกสาร (Badge สีฟ้า) */}
                          <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-xs inline-block">
                            {itemDocCode}
                          </span>
                          
                          {/* 2. ชื่อเอกสาร (ข้อความปกติสีเข้ม) */}
                          <span className="text-xs font-medium text-slate-700 mt-1 line-clamp-1 max-w-[200px] xl:max-w-xs" title={itemDocTitle}>
                            {itemDocTitle}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3.5 text-center align-middle whitespace-nowrap">
                        <span className="text-xs font-mono font-semibold text-slate-700">
                          Rev.{copy.doc_version || copy.rev || '00'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3.5 text-center align-middle whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className="px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-[#FFF8E6] text-[#B87C33] border border-[#FDE6B0] shadow-xs inline-block">
                            Copy {copy.copy_no || copy.ccNumber || '01'}
                          </span>
                          {(copy.is_replacement || (copy.issue_no && copy.issue_no !== '01')) && (
                            <span className="px-2 py-0.5 rounded-md bg-[#FFF8E6] text-[#B87C33] font-semibold border border-[#FDE6B0] text-xs whitespace-nowrap font-sans">
                              Issue {copy.issue_no || '02'} (ทดแทน)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3.5 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{copy.target_department || copy.targetDepartment || copy.recipientDepartment || copy.holder_dept || copy.department}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3.5 align-middle">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 line-clamp-1 max-w-xs" title={copy.location || copy.locationName || copy.station_name || `${copy.target_department || copy.holder_dept || copy.department || 'PD'} Head Office`}>
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{copy.location || copy.locationName || copy.station_name || `${copy.target_department || copy.holder_dept || copy.department || 'PD'} Head Office`}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3.5 text-center align-middle whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FFF8E6] text-[#B87C33] border border-[#FDE6B0]">
                          <span className="w-2 h-2 rounded-full bg-[#D49800] animate-pulse" />
                          <span>รอตรวจรับ ({copy.target_department || copy.targetDepartment || copy.recipientDepartment || copy.holder_dept || copy.department})</span>
                          <span className="sr-only">รอยืนยันรับเล่ม</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-3.5 text-xs text-slate-600 font-mono align-middle whitespace-nowrap">
                        {copy.dispatched_at ? new Date(copy.dispatched_at).toLocaleString('th-TH') : '-'}
                      </td>
                      <td className="py-3.5 px-3.5 text-xs font-medium text-slate-700 align-middle whitespace-nowrap">
                        {copy.dispatched_by || 'DCC Officer'}
                      </td>
                      <td className="py-3.5 px-3.5 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <button
                            onClick={() => handlePrintSingleCopy(copy)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
                            title="พิมพ์สำเนาประทับตราอีกครั้ง (Reprint Fallback)"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-500" />
                            <span>พิมพ์ซ้ำ</span>
                          </button>
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                            รอปลายทางตรวจรับ
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {dispatchedPagination.paginatedData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      <CheckCircle2 className="mx-auto text-[#14AE5C] mb-2" size={36} />
                      <div className="font-bold text-[#1E293B] text-base">ไม่มีสำเนาที่อยู่ระหว่างรอยืนยันรับเล่ม</div>
                      <p className="text-xs text-slate-400 mt-1">ทุกแผนกได้ทำการตรวจรับเอกสารฉบับพิมพ์เข้าสู่ระบบเรียบร้อยแล้ว</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={dispatchedPagination.currentPage}
            totalItems={dispatchedPagination.totalItems}
            pageSize={dispatchedPagination.pageSize}
            onPageChange={dispatchedPagination.setCurrentPage}
            onPageSizeChange={dispatchedPagination.setPageSize}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: เช็กลิสต์เรียกคืนเอกสาร (RECALL_CHECKLIST) */}
      {/* ========================================================================= */}
      {(activeTab === 'RECALL_CHECKLIST' || activeTab === 'RECALL') && (
        <div className="space-y-4">
          <h2 className="sr-only">เช็กลิสต์การเรียกคืนเอกสารฉบับเดิม (Recall Checklist)</h2>
          {/* Unified Action Toolbar */}
          <div className="bg-white p-3 rounded-xl border border-[#E5E5E5] flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 shadow-2xs">
            {/* Left: Compact Search & Department Select */}
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="ค้นหารหัส, ชื่อเอกสาร, หมายเลขสำเนา..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 h-9 text-xs bg-white border border-[#E5E5E5] rounded-lg focus:border-[#0D99FF] focus:ring-1 focus:ring-[#0D99FF] outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="px-2.5 py-1.5 h-9 text-xs bg-white border border-[#E5E5E5] rounded-lg font-medium text-slate-700 focus:outline-none focus:border-[#0D99FF] shrink-0"
              >
                <option value="ALL">ทุกแผนก</option>
                {departmentList.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Right: Alert Tag / Badge + Disposition Button */}
            <div className="flex items-center gap-2.5 justify-end shrink-0">
              {filteredRecallGroups.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  <AlertTriangle size={13} className="text-rose-600" />
                  <span>ต้องเรียกคืน {filteredRecallGroups.length} เอกสาร</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>ไม่มีเอกสารค้างเรียกคืน</span>
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveTab('AUDIT_TRAIL');
                  setAuditSubTab('DISPOSITION');
                  setSearchParams({ tab: 'AUDIT_TRAIL' });
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                title="ดูประวัติการทำลายและจัดเก็บสำเนาควบคุม"
              >
                <Archive size={14} />
                <span>ทะเบียนทำลายสำเนา</span>
              </button>
            </div>
          </div>

          {/* Grouped Document Recall Cards */}
          {filteredRecallGroups.map(group => {
            const receivedCopies = group.copies.filter(c => 
              c.status === 'RECALLED' || 
              c.status === 'RECEIVED_AT_DCC' || 
              c.status === 'RECALLED_HELD_AT_DCC' || 
              c.status === 'DESTROYED' || 
              c.status === 'RECALLED_DESTROYED' || 
              c.status === 'ARCHIVED_OBSOLETE'
            );
            const receivedCount = receivedCopies.length;
            const totalCount = group.copies.length;
            const percentage = totalCount > 0 ? Math.round((receivedCount / totalCount) * 100) : 0;
            const isAllReceived = totalCount > 0 && receivedCount === totalCount;

            return (
              <div 
                key={group.docId}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden"
              >
                {/* Header of Document Group */}
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/70">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-slate-900 font-mono">{group.docCode}</span>
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold font-mono text-xs">
                        Rev.{group.docVersion} (ฉบับเดิม)
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{group.docTitle}</p>
                  </div>

                  {/* Progress Bar & Status */}
                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="w-36 sm:w-48">
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-600">เก็บเล่มแล้ว {receivedCount}/{totalCount} จุด</span>
                        <span className={`font-mono ${isAllReceived ? 'text-emerald-600 font-bold' : receivedCount > 0 ? 'text-blue-600 font-bold' : 'text-slate-500'}`}>
                          {percentage}%
                        </span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <motion.div 
                          className={`h-full transition-all duration-300 ${
                            isAllReceived ? 'bg-emerald-500' : receivedCount > 0 ? 'bg-blue-500' : 'bg-slate-300'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Unified Single Action Button */}
                      <button
                        type="button"
                        onClick={() => setRecallModalGroup(group)}
                        title="เปิดหน้าต่างบันทึกจัดการสำเนา (ทำลายทิ้ง หรือ จัดเก็บเข้าคลังประวัติ)"
                        aria-label="จัดการเรียกคืนสำเนา (Disposition & Archive)"
                        className="px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 shrink-0 bg-[#0D99FF] hover:bg-[#007BE5] text-white shadow-md shadow-blue-500/20 cursor-pointer active:scale-98"
                      >
                        <FolderOpen size={16} />
                        <span>จัดการเรียกคืนสำเนา (Disposition &amp; Archive)</span>
                        {receivedCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white font-mono">
                            {receivedCount}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Locations Checklist Table (Unified 2-Stage Flow) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/50 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-3 w-16 text-center">รับเล่มจริง</th>
                        <th className="px-6 py-3">หมายเลขสำเนา</th>
                        <th className="px-6 py-3">แผนกผู้ครอบครอง</th>
                        <th className="px-6 py-3">จุดติดตั้ง (Location Point of Use)</th>
                        <th className="px-6 py-3 text-center">สถานะทางกายภาพ</th>
                        <th className="px-6 py-3 text-center">บันทึกตรวจรับ (DCC Custody)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.copies.map(copy => {
                        const isReceived = copy.status === 'RECALLED' || 
                          copy.status === 'RECEIVED_AT_DCC' || 
                          copy.status === 'RECALLED_HELD_AT_DCC' || 
                          copy.status === 'DESTROYED' || 
                          copy.status === 'RECALLED_DESTROYED' || 
                          copy.status === 'ARCHIVED_OBSOLETE';
                        const isDamaged = copy.isDamaged || copy.status === 'DAMAGED_PENDING_RECALL' || copy.replacementReason === 'DAMAGED' || copy.reportType === 'DAMAGED';
                        const isDestroyed = copy.status === 'DESTROYED' || copy.status === 'RECALLED_DESTROYED';
                        const isArchived = copy.status === 'ARCHIVED_OBSOLETE';

                        return (
                          <tr 
                            key={copy.id}
                            onClick={() => !isDestroyed && !isArchived && handleToggleRecallReceived(copy)}
                            className={`transition-colors ${
                              isDestroyed || isArchived
                                ? 'bg-slate-50/60 opacity-80 cursor-default'
                                : isReceived 
                                  ? 'bg-blue-50/40 hover:bg-blue-50/60 cursor-pointer' 
                                  : 'hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            <td className="px-6 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                disabled={isDestroyed || isArchived}
                                onClick={() => handleToggleRecallReceived(copy)}
                                title={
                                  isDestroyed ? "ทำลายแล้ว" :
                                  isArchived ? "จัดเก็บเข้าคลังแล้ว" :
                                  isReceived ? "คลิกเพื่อยกเลิกการตรวจรับเล่ม (เปลี่ยนกลับเป็นรอไปเก็บ)" :
                                  "คลิกเพื่อบันทึกว่าได้รับเล่มจริงคืนมาที่ DCC แล้ว"
                                }
                                className={`w-6 h-6 mx-auto rounded-lg flex items-center justify-center transition-all ${
                                  isDestroyed
                                    ? 'bg-emerald-600 text-white cursor-default'
                                    : isArchived
                                      ? 'bg-purple-600 text-white cursor-default'
                                      : isReceived 
                                        ? 'bg-[#0D99FF] text-white cursor-pointer shadow-xs shadow-blue-500/30' 
                                        : 'border-2 border-slate-300 hover:border-blue-500 text-transparent cursor-pointer'
                                }`}
                              >
                                <Check size={14} strokeWidth={3} />
                              </button>
                            </td>
                            <td className="px-6 py-3.5 font-mono font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span>Copy {copy.copy_no || copy.ccNumber || '01'}</span>
                                {isDamaged && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                    เล่มชำรุดรอเรียกคืน
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-3.5 font-semibold text-slate-800">
                              {copy.holder_dept || copy.department}
                            </td>
                            <td className="px-6 py-3.5 text-slate-700">
                              <span className="flex items-center gap-1.5">
                                <MapPin size={14} className="text-slate-400" />
                                {copy.location || copy.locationName || copy.station_name || `${copy.holder_dept || copy.department || 'PD'} Head Office`}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              {isDestroyed ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <Check size={12} strokeWidth={2.5} /> ทำลายแล้ว (Destroyed)
                                </span>
                              ) : isArchived ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  <Archive size={12} strokeWidth={2.5} /> เก็บเข้าคลังประวัติ (Archived)
                                </span>
                              ) : isReceived ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                  <Clock size={12} strokeWidth={2.5} /> ได้รับเล่มจริงแล้ว (รอทำลาย)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  <Clock size={12} strokeWidth={2.5} /> รอไปเก็บเล่มจากหน้างาน
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-center text-xs text-slate-500">
                              {copy.recalled_at ? (
                                <div className="space-y-0.5 font-mono">
                                  <div className="text-slate-700 font-medium">
                                    {new Date(copy.recalled_at).toLocaleDateString('th-TH')}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    โดย {copy.recalled_by || 'DCC'}
                                  </div>
                                </div>
                              ) : isDestroyed ? (
                                <span className="text-emerald-700 font-medium">ทำลายเรียบร้อย</span>
                              ) : isArchived ? (
                                <span className="text-purple-700 font-medium">เข้าคลังประวัติ</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {filteredRecallGroups.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 shadow-2xs">
              <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={32} />
              <div className="font-bold text-slate-800 text-sm">ไม่มีเอกสารฉบับเก่าค้างเรียกคืน</div>
              <p className="text-xs text-slate-400 mt-0.5">สำเนาฉบับก่อนหน้าทั้งหมดได้รับการเก็บคืนและทำลายอย่างสมบูรณ์</p>
            </div>
          )}
        </div>
      )}

      {/* DCC Recall Action Modal (Multi-Step: Check-in → Disposition → Confirm) */}
      {recallModalGroup && (
        <DccRecallActionModal
          isOpen={!!recallModalGroup}
          onClose={() => setRecallModalGroup(null)}
          group={recallModalGroup}
          onComplete={() => setRecallModalGroup(null)}
        />
      )}

      {/* ========================================================================= */}

      {/* TAB 4: สำเนาใช้งานทั้งหมด (ACTIVE_REGISTER) */}
      {/* ========================================================================= */}
      {(activeTab === 'ACTIVE_REGISTER' || activeTab === 'ACTIVE') && (
        <div className="w-full bg-white rounded-xl border border-[#E5E5E5] shadow-2xs overflow-hidden space-y-4 h-auto">
          <div className="p-6 border-b border-[#E5E5E5] bg-white">
            <h2 className="text-lg font-bold text-[#1E1E1E] flex items-center gap-2">
              <Layers size={20} className="text-[#10B981]" /> ทะเบียนสำเนาควบคุมที่ใช้งานอยู่จริง ({activeCopies.length} เล่ม)
            </h2>
            <p className="text-xs text-[#666666] mt-0.5">
              ทะเบียนเอกสารควบคุมฉบับจริงที่ติดตั้งประจำจุดปฏิบัติงานในโรงงาน ({filteredActiveDocGroups.length} รายการเอกสาร)
            </p>
          </div>

          {/* Search & Department Filter Bar */}
          <div className="px-6 py-3 border-b border-[#E5E5E5] flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-white">
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="ค้นหารหัส, ชื่อเอกสาร, จุดติดตั้ง, หมายเลขสำเนา..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 h-9 text-xs bg-white border border-[#E5E5E5] rounded-lg focus:border-[#0D99FF] focus:ring-1 focus:ring-[#0D99FF] outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="px-2.5 py-1.5 h-9 text-xs bg-white border border-[#E5E5E5] rounded-lg font-medium text-slate-700 focus:outline-none focus:border-[#0D99FF] shrink-0"
              >
                <option value="ALL">ทุกแผนก</option>
                {departmentList.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {filteredActiveDocGroups.length > 0 && (
              <button
                type="button"
                onClick={toggleAllDocs}
                className="text-xs font-semibold text-[#0D99FF] hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer self-start md:self-auto flex items-center gap-1.5 shrink-0"
              >
                {allExpanded ? 'ยุบรายละเอียดทั้งหมด' : 'ขยายรายละเอียดทั้งหมด'}
              </button>
            )}
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full scrollbar-thin">
            <table className="w-full text-left text-sm text-[#1E293B] border-collapse">
              <thead className="bg-[#F8FAFC] text-[#374151] uppercase font-bold text-xs tracking-wider border-b border-[#E2E8F0] sticky top-0 z-10 shadow-xs backdrop-blur-sm whitespace-nowrap">
                <tr>
                  <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">รหัสและชื่อเอกสาร</th>
                  <th className="py-3 px-3.5 text-center select-none whitespace-nowrap bg-[#F8FAFC]">ฉบับ (Rev.)</th>
                  <th className="py-3 px-3.5 text-center select-none whitespace-nowrap bg-[#F8FAFC]">แผนกเจ้าของ</th>
                  <th className="py-3 px-3.5 text-center select-none whitespace-nowrap bg-[#F8FAFC]">จำนวนสำเนา</th>
                  <th className="py-3 px-3.5 text-left select-none whitespace-nowrap bg-[#F8FAFC]">แผนกที่ครอบครอง</th>
                  <th className="py-3 px-3.5 text-center select-none whitespace-nowrap bg-[#F8FAFC]">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {activePagination.paginatedData.map(group => {
                  const isExpanded = expandedDocKeys.has(group.key);
                  const holderDepts = Array.from(new Set(group.copies.map(c => c.holder_dept || c.department).filter(Boolean)));

                  return (
                    <React.Fragment key={group.key}>
                      {/* Master Document Row */}
                      <tr 
                        onClick={() => toggleExpandDoc(group.key)}
                        className={`hover:bg-[#F8FAFC] transition-colors cursor-pointer select-none ${isExpanded ? 'bg-blue-50/20' : ''}`}
                      >
                        <td className="py-3.5 px-3.5 align-middle">
                          <div className="flex items-start gap-2.5">
                            <div className={`mt-1 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-[#0D99FF]' : ''}`}>
                              <ChevronRight size={16} />
                            </div>
                            <div>
                              <div className="font-bold text-sm font-mono text-[#0D99FF] bg-[#E5F4FF] px-2.5 py-0.5 rounded-md border border-[#B8E1FF] inline-block mb-1">
                                {group.docCode}
                              </div>
                              <div className="text-sm font-medium text-[#1E293B] truncate max-w-sm leading-snug" title={group.docTitle}>
                                {group.docTitle}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3.5 text-center align-middle font-mono font-bold text-slate-700 text-sm whitespace-nowrap">
                          {group.docVersion}
                        </td>
                        <td className="py-3.5 px-3.5 text-center align-middle whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-semibold text-xs rounded-md border border-slate-200">
                            {group.ownerDept}
                          </span>
                        </td>
                        <td className="py-3.5 px-3.5 text-center align-middle whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-[#E6F7ED] text-[#14AE5C] font-semibold text-xs rounded-full border border-[#B3E7C9] inline-flex items-center gap-1.5">
                            <Layers size={13} className="text-[#14AE5C]" /> {group.copies.length} เล่มในจุดใช้งาน
                          </span>
                        </td>
                        <td className="py-3.5 px-3.5 text-left align-middle">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {holderDepts.length > 0 ? (
                              holderDepts.map(d => (
                                <span key={d} className="px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold text-xs rounded border border-blue-200">
                                  {d}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-3.5 text-center align-middle whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpandDoc(group.key);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors inline-flex items-center gap-1.5 mx-auto cursor-pointer"
                          >
                            {isExpanded ? (
                              <>ย่อรายละเอียด <ChevronDown size={14} /></>
                            ) : (
                              <>ดูสำเนา ({group.copies.length}) <ChevronRight size={14} /></>
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Sub-table for Copies under this Document */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={6} className="p-0">
                            <div className="py-3.5 px-4 pl-11 pr-6 border-l-4 border-l-[#0D99FF] bg-slate-50/70 space-y-2">
                              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
                                <span>รายการสำเนาควบคุมประจำจุดปฏิบัติงานของ {group.docCode} ({group.copies.length} เล่ม)</span>
                                <span className="text-[11px] text-slate-400 font-normal">คลิก "แจ้งชำรุด/หาย" เพื่อบันทึกคำร้องขอทดแทน</span>
                              </div>
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-2xs">
                                <table className="w-full text-left text-xs text-slate-700">
                                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                                    <tr>
                                      <th className="py-2.5 px-3">หมายเลขสำเนา</th>
                                      <th className="py-2.5 px-3">แผนกผู้ครอบครอง</th>
                                      <th className="py-2.5 px-3">จุดติดตั้ง (Location)</th>
                                      <th className="py-2.5 px-3">วันที่ตรวจรับ</th>
                                      <th className="py-2.5 px-3">ผู้ตรวจรับ</th>
                                      <th className="py-2.5 px-3 text-center">การจัดการ</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {group.copies.map(copy => {
                                      const copyNoStr = copy.copy_no || copy.ccNumber || '01';
                                      const isCopy01 = copyNoStr === '01' || copyNoStr === '1' || copyNoStr === 'CC-001' || copyNoStr === 'Copy 01';
                                      const isReplacement = copy.is_replacement || (copy.issue_no && copy.issue_no !== '01' && copy.issue_no !== 1);

                                      return (
                                        <tr key={copy.id || `${group.key}-${copyNoStr}`} className="hover:bg-slate-50/80 transition-colors">
                                          <td className="py-2.5 px-3 align-middle">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className="px-2 py-0.5 bg-[#E6F7ED] text-[#14AE5C] font-semibold font-mono text-xs rounded-md border border-[#B3E7C9] whitespace-nowrap">
                                                Copy {copyNoStr}
                                              </span>
                                              {isCopy01 && (
                                                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold border border-blue-200 text-[11px] whitespace-nowrap">
                                                  เล่มควบคุมจุดต้นทาง
                                                </span>
                                              )}
                                              {isReplacement && (
                                                <span className="px-2 py-0.5 rounded-md bg-[#FFF8E6] text-[#B87C33] font-semibold border border-[#FDE6B0] text-[11px] whitespace-nowrap font-sans">
                                                  Issue {copy.issue_no || '02'} (ทดแทน)
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="py-2.5 px-3 font-semibold text-slate-800 align-middle whitespace-nowrap">
                                            {copy.holder_dept || copy.department || '-'}
                                          </td>
                                          <td className="py-2.5 px-3 text-slate-600 align-middle">
                                            <span className="flex items-center gap-1.5">
                                              <MapPin size={13} className="text-[#14AE5C] shrink-0" />
                                              <span>{copy.location || copy.locationName || copy.station_name || `${copy.holder_dept || copy.department || 'PD'} Head Office`}</span>
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 font-mono text-slate-600 align-middle whitespace-nowrap">
                                            {copy.receipt_confirmed_at 
                                              ? new Date(copy.receipt_confirmed_at).toLocaleDateString('th-TH') 
                                              : (copy.dateIssued ? new Date(copy.dateIssued).toLocaleDateString('th-TH') : '-')}
                                          </td>
                                          <td className="py-2.5 px-3 font-medium text-slate-800 align-middle whitespace-nowrap">
                                            {copy.receipt_confirmed_by || copy.holder_name || '-'}
                                          </td>
                                          <td className="py-2.5 px-3 text-center align-middle whitespace-nowrap">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedInstance(copy);
                                                setReportModalOpen(true);
                                              }}
                                              className="px-2.5 py-1 text-xs font-semibold text-[#F24822] bg-[#FEECE8] hover:bg-[#FFE5E0] rounded-lg border border-[#FAD3CC] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                              title="แจ้งชำรุด หรือสูญหาย"
                                            >
                                              <AlertTriangle size={12} /> แจ้งชำรุด/หาย
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {activePagination.paginatedData.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      <div className="font-bold text-slate-700">ไม่พบข้อมูลสำเนาควบคุมที่ใช้งาน</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={activePagination.currentPage}
            totalItems={activePagination.totalItems}
            pageSize={activePagination.pageSize}
            onPageChange={activePagination.setCurrentPage}
            onPageSizeChange={activePagination.setPageSize}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: ประวัติและบันทึกการทำงาน (AUDIT_TRAIL / HISTORY) */}
      {/* ========================================================================= */}
      {(activeTab === 'AUDIT_TRAIL' || activeTab === 'HISTORY') && (
        <div className="w-full bg-white border border-[#E5E5E5] rounded-xl overflow-hidden shadow-2xs space-y-0 h-auto">
          {/* Sub-Tabs Selector */}
          <div className="px-4 pt-3 pb-0 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAuditSubTab('ACTIVITY')}
                className={`pb-2.5 px-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                  auditSubTab === 'ACTIVITY'
                    ? 'border-[#0D99FF] text-[#0D99FF]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock size={15} />
                <span>บันทึกกิจกรรมทั่วไป</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold ${
                  auditSubTab === 'ACTIVITY' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {filteredAuditLogs.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAuditSubTab('DISPOSITION')}
                className={`pb-2.5 px-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                  auditSubTab === 'DISPOSITION'
                    ? 'border-rose-600 text-rose-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Archive size={15} />
                <span>ทะเบียนทำลายสำเนา</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold ${
                  auditSubTab === 'DISPOSITION' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {filteredDispositionRecords.length}
                </span>
              </button>
            </div>
            
            <div className="pb-2 text-[11px] text-slate-400 font-mono hidden md:block">
              ISO 9001: 7.5.3.2 Retention &amp; Disposition
            </div>
          </div>

          {/* Unified Action Toolbar for Tab 5 */}
          <div className="p-3 bg-white border-b border-[#E5E5E5] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <span className="sr-only">บันทึกประวัติการจัดการสำเนาและวงจรเอกสาร (DCC Activity Logs)</span>
            {/* Single Search Bar controlling active subtab */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder={auditSubTab === 'ACTIVITY' ? "ค้นหา Log, เอกสาร, ผู้ดำเนินการ..." : "ค้นหารหัส, เล่ม, ผู้ทำลาย, อ้างอิง..."}
                value={auditSubTab === 'ACTIVITY' ? auditSearchTerm : dispositionSearchTerm}
                onChange={(e) => {
                  if (auditSubTab === 'ACTIVITY') {
                    setAuditSearchTerm(e.target.value);
                  } else {
                    setDispositionSearchTerm(e.target.value);
                  }
                }}
                className="w-full pl-9 pr-3 py-1.5 h-9 text-xs bg-white border border-[#E5E5E5] rounded-lg outline-none focus:border-[#0D99FF] focus:ring-1 focus:ring-[#0D99FF] placeholder:text-slate-400"
              />
            </div>

            {/* Right: Items Count & Export CSV Button */}
            <div className="flex items-center gap-3 justify-end shrink-0">
              <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
                ทั้งหมด {auditSubTab === 'ACTIVITY' ? (filteredAuditLogs || []).length : (filteredDispositionRecords || []).length} รายการ
              </span>

              <button
                type="button"
                onClick={auditSubTab === 'ACTIVITY' ? handleExportAuditCsv : handleExportDispositionCsv}
                className="px-3.5 py-1.5 h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                title="Export CSV"
              >
                <FileDown size={14} /> <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Sub-Tab 1: Activity Logs */}
          {auditSubTab === 'ACTIVITY' && (
            <div>

              {/* Table / List */}
              {(!auditPagination.paginatedData || auditPagination.paginatedData.length === 0) ? (
                <div className="p-12 text-center text-xs text-[#888888]">
                  <Clock className="mx-auto text-slate-300 mb-2" size={32} />
                  ยังไม่มีประวัติการทำรายการในระบบ
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full scrollbar-thin">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[700px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#374151] font-bold text-xs uppercase tracking-wider sticky top-0 z-10 shadow-xs backdrop-blur-sm whitespace-nowrap">
                      <tr>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">วัน-เวลา</th>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">กิจกรรม (Action)</th>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">รหัส / หมายเลขสำเนา</th>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">ผู้ดำเนินการ</th>
                        <th className="py-3 px-3.5 bg-[#F8FAFC]">รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F0F0] text-[#333333]">
                      {auditPagination.paginatedData.map((log, index) => {
                        const timeStr = log?.timestamp ? (() => {
                          try {
                            const d = new Date(log.timestamp);
                            return isNaN(d.getTime()) ? String(log.timestamp) : d.toLocaleString('th-TH');
                          } catch {
                            return String(log.timestamp || '-');
                          }
                        })() : '-';

                        const actorStr = typeof log?.performed_by === 'object' 
                          ? (log?.performed_by?.name || log?.performed_by?.user || JSON.stringify(log.performed_by))
                          : (log?.performed_by || log?.user || log?.actor || '-');

                        const actionStr = typeof log?.action === 'object'
                          ? JSON.stringify(log.action)
                          : (log?.action || 'บันทึกการทำงาน');

                        const docStr = typeof log?.document_code === 'object'
                          ? JSON.stringify(log.document_code)
                          : (log?.document_code || log?.docTitle || '-');

                        const copyStr = log?.copy_number || log?.ccNumber ? ` (Copy ${log.copy_number || log.ccNumber})` : '';

                        const detailsStr = typeof log?.details === 'object'
                          ? JSON.stringify(log.details)
                          : (log?.details || log?.remarks || log?.remark || '-');

                        return (
                          <tr key={log?.id || index} className="hover:bg-[#F9FBFD] transition-colors">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#666666] whitespace-nowrap">
                              {timeStr}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E5F4FF] text-[#0D99FF] border border-[#B8E1FF]">
                                {actionStr}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-[#1E1E1E] whitespace-nowrap">
                              {docStr}{log?.revision ? ` Rev.${String(log.revision).replace(/^rev\.?\s*/i, '')}` : ''}{copyStr}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {actorStr}
                            </td>
                            <td className="py-2.5 px-3 text-[#555555] max-w-md break-words">
                              {detailsStr}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <TablePagination
                currentPage={auditPagination.currentPage}
                totalItems={auditPagination.totalItems}
                pageSize={auditPagination.pageSize}
                onPageChange={auditPagination.setCurrentPage}
                onPageSizeChange={auditPagination.setPageSize}
              />
            </div>
          )}

          {/* Sub-Tab 2: Dedicated Disposition Ledger (ISO 9001 Compliance) */}
          {auditSubTab === 'DISPOSITION' && (
            <div>

              {/* Disposition Table */}
              {(!dispositionPagination.paginatedData || dispositionPagination.paginatedData.length === 0) ? (
                <div className="p-12 text-center text-xs text-[#888888] space-y-2">
                  <Archive className="mx-auto text-slate-300" size={36} />
                  <div className="font-semibold text-slate-700 text-sm">ยังไม่มีข้อมูลในทะเบียนประวัติการทำลายสำเนา</div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    เมื่อเจ้าหน้าที่ DCC ดำเนินการย่อยทำลายหรือประทับตราเก็บเข้าคลังในหน้า &quot;เช็กลิสต์เรียกคืนสำเนา&quot; ระบบจะบันทึกประวัติถาวรลงในทะเบียนนี้โดยอัตโนมัติ
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full scrollbar-thin">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[900px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#374151] font-bold text-xs uppercase tracking-wider sticky top-0 z-10 shadow-xs backdrop-blur-sm whitespace-nowrap">
                      <tr>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">วัน-เวลาจัดการ</th>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">เอกสาร &amp; สำเนา</th>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">แผนก &amp; จุดใช้งาน</th>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">การจัดการ (Disposition)</th>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">ผู้ดำเนินการ (DCC)</th>
                        <th className="py-3 px-3.5 whitespace-nowrap bg-[#F8FAFC]">พยาน / เอกสารอ้างอิง</th>
                        <th className="py-3 px-3.5 bg-[#F8FAFC]">บันทึกเพิ่มเติม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F0F0] text-[#333333]">
                      {dispositionPagination.paginatedData.map((rec, index) => {
                        const timeStr = rec.disposedAt ? (() => {
                          try {
                            const d = new Date(rec.disposedAt);
                            return isNaN(d.getTime()) ? String(rec.disposedAt) : d.toLocaleString('th-TH');
                          } catch {
                            return String(rec.disposedAt);
                          }
                        })() : '-';

                        const isDestroy = rec.dispositionType === 'DESTROYED';
                        const isLostVoided = rec.dispositionType === 'LOST_VOIDED' || rec.dispositionMethod === 'LOST_VOIDED';

                        return (
                          <tr key={rec.id || index} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-3.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                              {timeStr}
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="font-mono font-bold text-slate-900 text-xs">
                                {rec.docCode} <span className="text-slate-400 font-normal">Rev.{rec.revision || '00'}</span>
                              </div>
                              <div className="text-slate-500 text-[11px] line-clamp-1 max-w-xs" title={rec.docTitle}>
                                {rec.docTitle}
                              </div>
                              <div className="mt-0.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                  Copy {rec.copyNumber || '01'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3.5 text-xs text-slate-700 whitespace-nowrap">
                              <div className="font-semibold text-slate-800">{rec.department || '-'}</div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <MapPin size={11} /> {rec.location || '-'}
                              </div>
                            </td>
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {isLostVoided ? (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    <AlertOctagon size={12} /> จำหน่ายสูญหาย (Lost / Voided)
                                  </span>
                                  <div className="text-[10px] text-slate-400">
                                    {rec.dispositionMethod || 'ตัดจำหน่ายเล่มสูญหาย ประกาศยกเลิกสิทธิ์'}
                                  </div>
                                </div>
                              ) : isDestroy ? (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    <Flame size={12} /> ย่อยทำลาย (Destroyed)
                                  </span>
                                  <div className="text-[10px] text-slate-400">
                                    {rec.dispositionMethod === 'SHRED' ? 'ย่อยทำลายด้วยเครื่องตัดกระดาษ' :
                                     rec.dispositionMethod === 'INCINERATE' ? 'เผาทำลาย' :
                                     rec.dispositionMethod || 'ย่อยทำลาย'}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                    <Archive size={12} /> ประทับตราเก็บเข้าคลัง (Archived)
                                  </span>
                                  <div className="text-[10px] text-slate-400">
                                    {rec.dispositionMethod || 'ปั๊ม Obsolete เก็บเข้าประวัติ'}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3.5 text-xs font-medium text-slate-800 whitespace-nowrap">
                              {rec.disposedBy || 'DCC Officer'}
                            </td>
                            <td className="py-3 px-3.5 text-xs text-slate-700 whitespace-nowrap">
                              <div className="font-medium">{rec.witnessName || '-'}</div>
                              {rec.referenceNo && (
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  Ref: {rec.referenceNo}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3.5 text-xs text-slate-600 max-w-xs break-words">
                              {rec.notes || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <TablePagination
                currentPage={dispositionPagination.currentPage}
                totalItems={dispositionPagination.totalItems}
                pageSize={dispositionPagination.pageSize}
                onPageChange={dispositionPagination.setCurrentPage}
                onPageSizeChange={dispositionPagination.setPageSize}
              />
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ออกสำเนาใหม่ (Manual Issue Copy Modal) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {issueModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Header */}
              <div className="px-6 py-4 bg-white text-slate-900 flex justify-between items-center border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                    <PlusCircle size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900">
                      ออกสำเนาควบคุมใหม่ (Issue Controlled Copy)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      เลือกเอกสาร แผนก และจุดใช้งานที่ต้องการพิมพ์สำเนา
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setIssueModalOpen(false)} 
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer" 
                  title="ปิดหน้าต่าง"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleIssueSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm bg-slate-50/40">
                  <div className="space-y-1.5">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                      เลือกรหัสเอกสาร (เฉพาะเอกสารที่มีผลบังคับใช้) <span className="text-rose-500">*</span>:
                    </label>
                    <select
                      value={issueDoc}
                      onChange={(e) => setIssueDoc(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-medium"
                    >
                      <option value="">-- กรุณาเลือกเอกสาร --</option>
                      {(documents || []).filter(d => d.status === 'EFFECTIVE').map(d => (
                        <option key={d.id} value={d.title}>
                          {d.title} : {d.name} (Rev.{d.rev})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                      แผนกผู้รับสำเนา <span className="text-rose-500">*</span>:
                    </label>
                    <select
                      value={issueDept}
                      onChange={(e) => {
                        setIssueDept(e.target.value);
                        setIssueLocation('');
                      }}
                      required
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-medium"
                    >
                      <option value="">-- เลือกแผนกผู้รับ --</option>
                      {(masterDepartments || storeDepts || []).filter(d => typeof d === 'string' || d.status !== 'INACTIVE').map(d => {
                        const code = typeof d === 'string' ? d : d.id;
                        const name = typeof d === 'string' ? d : (d.nameTh || d.name);
                        return <option key={code} value={code}>{code} - {name}</option>;
                      })}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                      จุดใช้งานปลายทาง (Location / Line) <span className="text-rose-500">*</span>:
                    </label>
                    {availableIssueStations.length > 0 ? (
                      <select
                        value={issueLocation}
                        onChange={(e) => setIssueLocation(e.target.value)}
                        required
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-medium"
                      >
                        <option value="">-- เลือกจุดใช้งาน --</option>
                        {availableIssueStations.map(s => (
                          <option key={s.id} value={s.name}>{s.name} ({s.code || s.id})</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={issueLocation}
                        onChange={(e) => setIssueLocation(e.target.value)}
                        placeholder="เช่น Line 1 Mixing, QA Lab Binder"
                        required
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-medium"
                      />
                    )}
                  </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIssueModalOpen(false)}
                    className="bg-white hover:bg-slate-100 text-slate-700 font-medium text-sm px-4 py-2 rounded-xl border border-slate-300 shadow-xs transition-colors cursor-pointer"
                  >
                    ยกเลิก / ปิดหน้าต่าง
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm px-5 py-2 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <PlusCircle size={16} /> ยืนยันการออกสำเนาควบคุม
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: รายงานชำรุด / สูญหาย (Report Damaged/Lost) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {reportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Header */}
              <div className="px-6 py-4 bg-white text-slate-900 flex justify-between items-center border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900">
                      รายงานเอกสารชำรุด / สูญหาย (Report Damaged/Lost)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      บันทึกเหตุผลความจำเป็นเพื่อขออนุมัติออกเล่มทดแทน
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setReportModalOpen(false)} 
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer" 
                  title="ปิดหน้าต่าง"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleReportSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm bg-slate-50/40">
                  <div className="bg-slate-50/80 border border-slate-200/70 p-4 rounded-xl space-y-2 text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-semibold">รหัสเอกสาร:</span>
                      <strong className="font-mono text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100/80">{selectedInstance?.doc_code || selectedInstance?.docTitle}</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-semibold">หมายเลขสำเนา:</span>
                      <strong className="font-mono text-slate-900">Copy {selectedInstance?.copy_no || selectedInstance?.ccNumber}</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-semibold">จุดใช้งาน:</span>
                      <strong className="text-slate-900">{selectedInstance?.location || selectedInstance?.locationName}</strong>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                      ประเภทรายงาน <span className="text-rose-500">*</span>:
                    </label>
                    <div className="flex gap-3">
                      <label className={`flex items-center gap-2 cursor-pointer text-sm font-medium p-3 rounded-xl border transition-all flex-1 ${
                        reportType === 'DAMAGED' ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-500/20 text-rose-950 font-bold' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input
                          type="radio"
                          value="DAMAGED"
                          checked={reportType === 'DAMAGED'}
                          onChange={(e) => setReportType(e.target.value)}
                          className="text-rose-600 focus:ring-rose-500 w-4 h-4"
                        />
                        <span>เอกสารชำรุด (Damaged)</span>
                      </label>
                      <label className={`flex items-center gap-2 cursor-pointer text-sm font-medium p-3 rounded-xl border transition-all flex-1 ${
                        reportType === 'LOST' ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-500/20 text-rose-950 font-bold' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input
                          type="radio"
                          value="LOST"
                          checked={reportType === 'LOST'}
                          onChange={(e) => setReportType(e.target.value)}
                          className="text-rose-600 focus:ring-rose-500 w-4 h-4"
                        />
                        <span>เอกสารสูญหาย (Lost)</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                      สาเหตุและความจำเป็น <span className="text-rose-500">*</span>:
                    </label>
                    <textarea
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      required
                      placeholder="ระบุสาเหตุที่ชำรุดหรือสูญหาย พร้อมความจำเป็นในการขอออกเล่มทดแทน..."
                      rows={3}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-600 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none resize-none font-medium"
                    />
                  </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setReportModalOpen(false)}
                    className="bg-white hover:bg-slate-100 text-slate-700 font-medium text-sm px-4 py-2 rounded-xl border border-slate-300 shadow-xs transition-colors cursor-pointer"
                  >
                    ยกเลิก / ปิดหน้าต่าง
                  </button>
                  <button
                    type="submit"
                    disabled={!reportReason.trim()}
                    className="bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-semibold text-sm px-5 py-2 rounded-xl shadow-xs transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <AlertTriangle size={16} /> บันทึกรายงาน
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* POKA-YOKE: Warning Modal - Dispatch Before Print Guard */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {unprintedWarningModal.isOpen && unprintedWarningModal.targetItem && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setUnprintedWarningModal({ isOpen: false, targetItem: null })}
            />
            {/* Modal Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-200 overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-5 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertOctagon className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-900">
                    เอกสารนี้ยังไม่ได้สั่งพิมพ์สำเนาควบคุม
                  </h3>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    ท่านยังไม่ได้สั่งพิมพ์สำเนาควบคุมฉบับจริง หากบันทึกส่งมอบ แผนกผู้รับจะไม่ได้รับเล่มจริงในการตรวจรับ
                  </p>
                </div>
                <button
                  onClick={() => setUnprintedWarningModal({ isOpen: false, targetItem: null })}
                  className="ml-auto shrink-0 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Copy Info */}
              <div className="px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {unprintedWarningModal.targetItem.document_code || unprintedWarningModal.targetItem.doc_code || '-'}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>Copy {unprintedWarningModal.targetItem.copy_no || unprintedWarningModal.targetItem.ccNumber || '01'}</span>
                  <span className="text-slate-400">·</span>
                  <span>{unprintedWarningModal.targetItem.holder_dept || unprintedWarningModal.targetItem.department || '-'}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 py-5 flex flex-col gap-3">
                {/* Primary: Print + Dispatch */}
                <button
                  onClick={() => handlePrintAndDispatch(unprintedWarningModal.targetItem)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] shadow-sm transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>สั่งพิมพ์และบันทึกส่งมอบทันที</span>
                </button>

                {/* Secondary: Force Dispatch (skip print) */}
                <button
                  onClick={() => handleForceDispatch(unprintedWarningModal.targetItem)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>ยืนยันส่งมอบ (ข้ามการพิมพ์)</span>
                </button>

                {/* Cancel: Go back to print */}
                <button
                  onClick={() => setUnprintedWarningModal({ isOpen: false, targetItem: null })}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>กลับไปพิมพ์ก่อน</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ControlledCopyRegister;
