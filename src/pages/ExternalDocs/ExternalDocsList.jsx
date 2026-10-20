import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import useStore from '../../store/useStore';
import { 
  FileText, 
  Search, 
  Plus, 
  Download, 
  Eye, 
  History, 
  Archive, 
  Globe, 
  Share2,
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  FilterX, 
  RotateCw,
  Building2,
  Lock,
  Layers,
  AlertCircle,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  X,
  ArrowRight,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ExternalDocFormModal from './ExternalDocFormModal';
import ExternalDocPreviewModal from './ExternalDocPreviewModal';
import ExternalDocDetailModal from './ExternalDocDetailModal';
import ExternalDocHistoryModal from './ExternalDocHistoryModal';
import ExternalDocObsoleteModal from './ExternalDocObsoleteModal';
import ExternalDocSupersededModal from './ExternalDocSupersededModal';
import RequestAdditionalCopiesModal from '../../components/workflow/RequestAdditionalCopiesModal';
import UniversalWatermarkService, { WATERMARK_TYPES } from '../../services/UniversalWatermarkService';
import toast from 'react-hot-toast';
import { TablePagination } from '../../components/common/TablePagination';
import { getDeptBadgeStyle } from '../../utils/departmentColors';
import { useTablePagination } from '../../hooks/useTablePagination';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { normalizeDept } from '../../utils/darHelper';
import { extractDeptCode } from '../../services/darService';

// Safe date formatter with robust fallback (EC-2)
export const fmtDate = (d) => {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toISOString().split('T')[0];
  } catch {
    return String(d);
  }
};

// Canonical Document Key Extractor (Grouping by docNo)
export const getCanonicalDocNo = (doc) => {
  if (!doc) return '';
  const candidate = doc.docNo || doc.edCode || doc.doc_code || doc.docCode || doc.documentCode || doc.id || '';
  const str = String(candidate).trim();
  if (str.includes('-SUPERSEDED')) {
    return str.split('-SUPERSEDED')[0].trim();
  }
  if (str.includes('_SUPERSEDED')) {
    return str.split('_SUPERSEDED')[0].trim();
  }
  return str;
};

// Deep search matcher for an individual edition snapshot
export const matchesEditionSearch = (editionDoc, term) => {
  if (!editionDoc || !term || !term.trim()) return false;
  const q = term.toLowerCase().trim();
  const code = String(editionDoc.docNo || editionDoc.edCode || editionDoc.doc_code || editionDoc.documentCode || editionDoc.id || '').toLowerCase();
  const title = String(editionDoc.title || editionDoc.docTitle || editionDoc.name || '').toLowerCase();
  const titleTh = String(editionDoc.titleTh || '').toLowerCase();
  const source = String(editionDoc.issuer || editionDoc.officialIssuer || editionDoc.source || '').toLowerCase();
  const ver = String(editionDoc.edition || editionDoc.sourceVersion || editionDoc.rev || '').toLowerCase();
  const ref = String(editionDoc.edrNumber || editionDoc.requestNo || editionDoc.darNo || editionDoc.supersededByEdition || '').toLowerCase();
  return code.includes(q) || title.includes(q) || titleTh.includes(q) || source.includes(q) || ver.includes(q) || ref.includes(q);
};

// Deep search matcher for a parent document stack
export const stackMatchesSearch = (stack, term) => {
  if (!term || !term.trim()) {
    return { matches: true, childMatches: false, matchingChildren: [] };
  }
  const q = term.toLowerCase().trim();
  const parentMatches = (
    stack.docNo.toLowerCase().includes(q) ||
    stack.title.toLowerCase().includes(q) ||
    (stack.titleTh && stack.titleTh.toLowerCase().includes(q)) ||
    stack.issuer.toLowerCase().includes(q) ||
    stack.department.toLowerCase().includes(q)
  );

  const matchingChildren = (stack.allEditions || []).filter(ed => matchesEditionSearch(ed, q));
  const childMatches = matchingChildren.length > 0;

  return {
    matches: parentMatches || childMatches,
    childMatches,
    matchingChildren
  };
};

// Main Category Tab Constants (Level 1)
const TAB_GENERAL = 'GENERAL';
const TAB_MY_DEPT = 'MY_DEPT';
const TAB_DISTRIBUTED = 'DISTRIBUTED';

// Official Lifecycle Statuses for Master External Document Library (ISO 9001:2015 Clause 7.5.3.2)
export const OFFICIAL_LIFECYCLE_STATUSES = [
  'ACTIVE',
  'EFFECTIVE',
  'SUPERSEDED',
  'SUPERSEDED_ARCHIVED',
  'OBSOLETE',
  'OBSOLETE_ARCHIVED'
];

export const isOfficialLifecycleDoc = (doc) => {
  if (!doc) return false;
  const status = String(doc.status || '').toUpperCase();
  if (
    status.includes('REJECT') ||
    status.startsWith('PENDING') ||
    status.includes('REVISE') ||
    status === 'DRAFT'
  ) {
    return false;
  }
  if (doc.is_obsolete || doc.is_superseded) return true;
  return OFFICIAL_LIFECYCLE_STATUSES.includes(status);
};

const ExternalDocsList = () => {
  const navigate = useNavigate();
  const { 
    externalDocuments, 
    externalRequests,
    currentUser, 
    tasks,
    logExternalDownload, 
    masterDepartments, 
    departments: storeDepts,
    controlledCopyInstances,
    documentControlledCopies,
    simulatedSystemDate,
    getEffectiveToday,
    resetPendingReviewIntent
  } = useStore();
  
  // Level 1: Main Category Tabs (GENERAL, MY_DEPT, DISTRIBUTED)
  const [activeMainTab, setActiveMainTab] = useState(TAB_MY_DEPT);
  
  const [searchTerm, setSearchTerm] = useState('');
  // Level 2: 4 Status Filter Pills: ACTIVE, SUPERSEDED, OBSOLETE, ALL (default: ACTIVE)
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [scopeFilter, setScopeFilter] = useState('ALL');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [docToEdit, setDocToEdit] = useState(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [docToPreview, setDocToPreview] = useState(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [docToDetail, setDocToDetail] = useState(null);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [docToHistory, setDocToHistory] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedHistoryDocCode, setSelectedHistoryDocCode] = useState(null);
  
  const [isObsoleteModalOpen, setIsObsoleteModalOpen] = useState(false);
  const [docToObsolete, setDocToObsolete] = useState(null);

  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [selectedDocForCopy, setSelectedDocForCopy] = useState(null);

  // Header Document Selector Modal (for Update Revision or Obsolete when triggered from Header)
  const [selectModalMode, setSelectModalMode] = useState(null); // 'UPDATE' | 'OBSOLETE' | null
  const [selectorSearch, setSelectorSearch] = useState('');

  // Row-level 3-dot action menu
  const [openMenuDocId, setOpenMenuDocId] = useState(null);

  // Dedicated Superseded Editions Modal state
  const [isSupersededModalOpen, setIsSupersededModalOpen] = useState(false);
  const [selectedDocForSupersededModal, setSelectedDocForSupersededModal] = useState(null);

  const handleOpenSupersededModal = (stack, e) => {
    if (e) e.stopPropagation();
    setSelectedDocForSupersededModal(stack);
    setIsSupersededModalOpen(true);
    setOpenMenuDocId(null);
  };

  // Deep-linking from notifications or external triggers
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const deepLinkDocCode = searchParams.get('docCode') || searchParams.get('openDocCode') || searchParams.get('code') || location.state?.openDocCode;
  const deepLinkDocId = searchParams.get('docId') || searchParams.get('openDocId') || searchParams.get('id') || location.state?.openDocId;
  const autoOpenUpdate = searchParams.get('autoOpenUpdate') === 'true' || location.state?.autoOpenUpdate === true;
  const autoOpenObsolete = searchParams.get('autoOpenObsolete') === 'true' || location.state?.autoOpenObsolete === true;

  const isDccAdmin = Boolean(
    currentUser?.role === 'DCC' || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.isDccAdmin || 
    currentUser?.isDcc || 
    currentUser?.role === 'ADMIN'
  );
  const isAdmin = isDccAdmin;
  const uDept = currentUser?.department || currentUser?.dept || 'QA';

  const availableDepts = useMemo(() => {
    return (masterDepartments || storeDepts || []).filter(d => typeof d === 'string' || d.status !== 'INACTIVE');
  }, [masterDepartments, storeDepts]);

  const myReviseCount = useMemo(() => {
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

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.ed-action-dock') && !e.target.closest('.ed-dropdown-menu')) {
        setOpenMenuDocId(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenMenuDocId(null);
        setSelectModalMode(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Helper: Calculate Validity Status
  const getValidityInfo = useCallback((doc) => {
    if (doc.status === 'OBSOLETE' || doc.status === 'OBSOLETE_ARCHIVED' || doc.is_obsolete) {
      return { status: 'OBSOLETE', label: 'ยกเลิกแล้ว', colorClass: 'badge-inactive' };
    }
    if (doc.status === 'SUPERSEDED' || doc.status === 'SUPERSEDED_ARCHIVED' || doc.is_superseded) {
      return { status: 'SUPERSEDED', label: 'ตกรุ่น', colorClass: 'badge-pending' };
    }
    
    if (!doc.nextReviewDate && !doc.effectiveDate) {
      return { status: 'NORMAL', label: 'ปกติ', colorClass: 'badge-active' };
    }

    const today = getEffectiveToday ? getEffectiveToday() : (simulatedSystemDate ? new Date(simulatedSystemDate) : new Date());
    today.setHours(0, 0, 0, 0);

    let reviewDateObj;
    if (doc.nextReviewDate) {
      reviewDateObj = new Date(doc.nextReviewDate);
    } else {
      reviewDateObj = new Date(doc.effectiveDate);
      reviewDateObj.setMonth(reviewDateObj.getMonth() + (Number(doc.reviewCycleMonths) || 12));
    }
    reviewDateObj.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((reviewDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { 
        status: 'OVERDUE', 
        label: `เกินกำหนด (${Math.abs(diffDays)} วัน)`, 
        colorClass: 'badge-rejected',
        diffDays,
        formattedDate: reviewDateObj.toISOString().split('T')[0]
      };
    } else if (diffDays <= 30) {
      return { 
        status: 'DUE_SOON', 
        label: `ใกล้ครบกำหนด (${diffDays} วัน)`, 
        colorClass: 'badge-pending',
        diffDays,
        formattedDate: reviewDateObj.toISOString().split('T')[0]
      };
    }

    return { 
      status: 'NORMAL', 
      label: 'ปกติ', 
      colorClass: 'badge-active',
      diffDays,
      formattedDate: reviewDateObj.toISOString().split('T')[0]
    };
  }, [getEffectiveToday, simulatedSystemDate]);

  // Department normalization & matching helpers
  const getUserDepartments = (user) => {
    if (!user) return [];
    const depts = [];
    if (user.department) depts.push(user.department);
    if (user.primary_department) depts.push(user.primary_department);
    if (user.dept) depts.push(user.dept);
    if (user.dept_code) depts.push(user.dept_code);
    if (Array.isArray(user.departments)) depts.push(...user.departments);
    if (Array.isArray(user.secondaryDepartments)) depts.push(...user.secondaryDepartments);
    if (Array.isArray(user.depts)) depts.push(...user.depts);
    if (Array.isArray(user.affiliated_departments)) depts.push(...user.affiliated_departments);
    return [...new Set(depts.filter(Boolean))];
  };

  const userDepts = useMemo(() => getUserDepartments(currentUser), [currentUser]);

  const deptMatches = useCallback((d1, d2) => {
    const s1 = normalizeDept(d1);
    const s2 = normalizeDept(d2);
    if (!s1 || !s2) return false;
    if (s1 === s2) return true;
    if ((s1 === 'QA' || s1 === 'QA/QC' || s1 === 'QAQC' || s1 === 'QC') && (s2 === 'QA' || s2 === 'QA/QC' || s2 === 'QAQC' || s2 === 'QC')) return true;
    return false;
  }, []);

  const getDocCode = (doc) => {
    if (!doc) return '';
    return (
      doc.documentCode ||
      doc.edCode ||
      doc.doc_code ||
      doc.docCode ||
      doc.docNo ||
      doc.id ||
      ''
    );
  };

  const isOwnerDept = useCallback((doc) => {
    if (!doc) return false;
    // DCC controls the whole register (ISO 7.5.3): every dept's non-general doc belongs in "My Dept"
    if (isDccAdmin && !isGeneralDoc(doc)) return true;
    const docDept = doc.department || doc.dept || doc.owner_dept || extractDeptCode(getDocCode(doc));
    return userDepts.includes(docDept) || userDepts.some(ud => deptMatches(ud, docDept));
  }, [userDepts, deptMatches, isDccAdmin]);

  const canManageDoc = (doc) => {
    if (!doc) return false;
    const isOwner = isOwnerDept(doc);
    const isActive = doc.status === 'ACTIVE' || doc.status === 'EFFECTIVE';
    return (isOwner || isDccAdmin) && isActive;
  };

  const isGeneralDoc = (doc) => {
    const scope = (
      doc.accessScope ||
      doc.access_scope ||
      doc.distributionScope ||
      doc.distribution_scope ||
      doc.scope ||
      ''
    ).toString().trim().toUpperCase();

    return (
      scope === 'GENERAL' ||
      scope === 'ALL' ||
      doc.accessScope === 'ทั่วไป' ||
      doc.distributionScope === 'ทั่วไป'
    );
  };

  const hasDistributedCopyToUserDept = useCallback((doc) => {
    if (isOwnerDept(doc)) return false; // Strict: exclude own department
    
    // 1. Array of distributed dept codes / allowedDepartments
    const allowedDepts = doc.allowedDepartments || doc.allowed_departments || doc.distributed_depts || [];
    const inDistDepts = (allowedDepts || []).some(d => userDepts.some(ud => deptMatches(d, ud)));

    // 2. Array of distribution objects
    const inDistObjs = (doc.distributions || []).some(d => userDepts.some(ud => deptMatches(d.departmentId || d.department || d.dept, ud)));

    // 3. Access departments
    const inAccessDepts = (doc.accessDepartments || []).some(d => userDepts.some(ud => deptMatches(d, ud)));

    // 4. Restricted user check (currentUser.id in allowedUsers or accessUsers)
    const allowedUsersList = doc.allowedUsers || doc.allowed_users || doc.accessUsers || [];
    const isUserAllowed = Boolean(currentUser?.id && allowedUsersList.includes(currentUser.id));

    // 5. Physical controlled copies in store
    const hasControlledCopy = (controlledCopyInstances || documentControlledCopies || []).some(c => {
      const matchDoc = String(c.externalDocId || c.external_doc_id || c.docId || c.doc_id) === String(doc.id) ||
                       c.doc_code === doc.edCode ||
                       c.doc_code === doc.id ||
                       c.docTitle === doc.title;
      return matchDoc && userDepts.some(ud => deptMatches(c.holder_dept || c.department, ud)) && ['ISSUED_ACTIVE', 'ACTIVE'].includes(c.status);
    });

    return Boolean(inDistDepts || inDistObjs || inAccessDepts || isUserAllowed || hasControlledCopy);
  }, [isOwnerDept, userDepts, deptMatches, currentUser, controlledCopyInstances, documentControlledCopies]);

  // Master Document Source (Official Lifecycle Records: ACTIVE, SUPERSEDED, OBSOLETE)
  const allExternalDocs = useMemo(() => {
    return (externalDocuments || []).filter(doc => isOfficialLifecycleDoc(doc));
  }, [externalDocuments]);

  // Accessibility & Confidentiality Filter for General User Access Check
  const accessibleDocs = useMemo(() => {
    return allExternalDocs.filter(doc => {
      if (isAdmin || isDccAdmin) return true;

      const isOwner = Boolean(currentUser?.id && doc?.ownerId === currentUser.id);
      const isReviewer = Boolean(currentUser?.id && doc?.reviewerId === currentUser.id);
      const isApprover = Boolean(currentUser?.id && doc?.approverId === currentUser.id);
      const isAck = Boolean(currentUser?.id && Array.isArray(doc?.acknowledgees) && doc.acknowledgees.includes(currentUser.id));
      const isInvolved = isOwner || isReviewer || isApprover || isAck;

      const scope = (doc?.accessScope || doc?.access_scope || doc?.distributionScope || doc?.distribution_scope || doc?.scope || '').toString().trim().toUpperCase();
      if (scope === 'GENERAL' || scope === 'ALL' || doc?.accessScope === 'ทั่วไป' || !doc?.accessScope) return true;

      if (scope === 'DEPARTMENT' || doc?.accessScope === 'Department') {
        const allowedDepts = doc?.allowedDepartments || doc?.allowed_departments || doc?.accessDepartments || [];
        const inAllowedDept = (allowedDepts || []).some(d => userDepts.some(ud => deptMatches(d, ud)));
        return isInvolved || inAllowedDept || isOwnerDept(doc);
      }
      if (scope === 'RESTRICTED' || doc?.accessScope === 'Restricted') {
        const allowedUsers = Array.isArray(doc?.allowedUsers) ? doc.allowedUsers : (Array.isArray(doc?.allowed_users) ? doc.allowed_users : (Array.isArray(doc?.accessUsers) ? doc.accessUsers : []));
        return isInvolved || Boolean(currentUser?.id && allowedUsers.includes(currentUser.id));
      }
      return false;
    });
  }, [allExternalDocs, isAdmin, isDccAdmin, currentUser, userDepts, isOwnerDept, deptMatches]);

  // ─────────────────────────────────────────────────────────────
  // Master Document Status Resolution (ISO 9001 Clause 7.5.3.2)
  // Maps every unique documentCode to its document-level Master Status:
  // - OBSOLETE: if latest revision is OBSOLETE, or if document code is obsoleted
  // - ACTIVE: if it has an active/effective revision (and not obsolete)
  // - SUPERSEDED: if it has superseded revisions and is neither active nor obsolete
  // ─────────────────────────────────────────────────────────────
  const docMasterMap = useMemo(() => {
    const map = new Map();
    (allExternalDocs || []).forEach(doc => {
      const code = getDocCode(doc);
      if (!code) return;
      if (!map.has(code)) {
        map.set(code, []);
      }
      map.get(code).push(doc);
    });

    const statusMap = new Map();

    map.forEach((docs, code) => {
      // Sort revisions descending
      const sorted = [...docs].sort((a, b) => {
        const revA = parseInt(String(a.rev || a.sourceVersion || a.edition || '0').replace(/\D/g, ''), 10) || 0;
        const revB = parseInt(String(b.rev || b.sourceVersion || b.edition || '0').replace(/\D/g, ''), 10) || 0;
        if (revB !== revA) return revB - revA;
        const dateA = new Date(a.effectiveDate || a.supersededAt || a.supersededDate || a.obsoleteDate || a.createdAt || 0);
        const dateB = new Date(b.effectiveDate || b.supersededAt || b.supersededDate || b.obsoleteDate || b.createdAt || 0);
        return dateB - dateA;
      });

      const topDoc = sorted[0];
      const hasActive = sorted.some(d => 
        (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && 
        !d.is_superseded && 
        !d.is_obsolete && 
        d.status !== 'SUPERSEDED' && 
        d.status !== 'OBSOLETE'
      );
      const isTopObsolete = topDoc.status === 'OBSOLETE' || topDoc.status === 'OBSOLETE_ARCHIVED' || topDoc.is_obsolete;
      const hasAnyObsolete = sorted.some(d => d.status === 'OBSOLETE' || d.status === 'OBSOLETE_ARCHIVED' || d.is_obsolete);

      let masterStatus = 'ACTIVE';
      if (isTopObsolete || (hasAnyObsolete && !hasActive)) {
        masterStatus = 'OBSOLETE';
      } else if (hasActive) {
        masterStatus = 'ACTIVE';
      } else if (sorted.some(d => d.status === 'SUPERSEDED' || d.status === 'SUPERSEDED_ARCHIVED' || d.is_superseded)) {
        masterStatus = 'SUPERSEDED';
      } else {
        masterStatus = topDoc.status || 'ACTIVE';
      }

      // Representative doc for display: active doc if active, obsolete doc if obsolete, else topDoc
      let representativeDoc = topDoc;
      if (masterStatus === 'ACTIVE') {
        representativeDoc = sorted.find(d => (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && !d.is_superseded && !d.is_obsolete && d.status !== 'SUPERSEDED' && d.status !== 'OBSOLETE') || topDoc;
      } else if (masterStatus === 'OBSOLETE') {
        representativeDoc = sorted.find(d => d.status === 'OBSOLETE' || d.status === 'OBSOLETE_ARCHIVED' || d.is_obsolete) || topDoc;
      }

      statusMap.set(code, {
        code,
        masterStatus,
        docs: sorted,
        topDoc,
        representativeDoc,
        groupCount: sorted.length
      });
    });

    return statusMap;
  }, [allExternalDocs]);

  // Phase 1, 2 & 3: Level 1 Main Category Data Routing & Tab Partitioning Rules
  const categoryDocs = useMemo(() => {
    return allExternalDocs.filter(doc => {
      const docCode = getDocCode(doc);
      const masterInfo = docMasterMap.get(docCode);
      const masterStatus = masterInfo?.masterStatus || doc.status || 'ACTIVE';
      const isActive = masterStatus === 'ACTIVE';
      const isGeneral = isGeneralDoc(doc);
      const isMyDept = isOwnerDept(doc);

      if (activeMainTab === TAB_MY_DEPT) {
        // แท็บ 1: "เอกสารในแผนกฉัน (My Department Docs)"
        // เงื่อนไข: userDepts.includes(doc.department)
        return isMyDept;
      }
      if (activeMainTab === TAB_GENERAL) {
        // แท็บ 2: "เอกสารทั่วไป (General Docs)"
        // เงื่อนไข: !userDepts.includes(doc.department) && (doc.accessScope || '').toUpperCase() === 'GENERAL' && masterStatus === 'ACTIVE'
        return !isMyDept && isGeneral && isActive;
      }
      if (activeMainTab === TAB_DISTRIBUTED) {
        // แท็บ 3: "เอกสารที่ได้รับการแจกจ่าย (Distributed Docs)"
        // เงื่อนไข: !userDepts.includes(doc.department) && (doc.accessScope || '').toUpperCase() !== 'GENERAL' && masterStatus === 'ACTIVE' && (isDeptAllowed || isUserAllowed || hasCopyInDept)
        return !isMyDept && !isGeneral && isActive && hasDistributedCopyToUserDept(doc);
      }
      return true;
    });
  }, [allExternalDocs, docMasterMap, activeMainTab, isOwnerDept, hasDistributedCopyToUserDept]);

  // Phase 2 & 3: Synchronized Scope Tab Counters (Effective-Only Unique Document Code Counts)
  const countMyDept = useMemo(() => {
    let count = 0;
    docMasterMap.forEach(info => {
      if (info.masterStatus === 'ACTIVE' && isOwnerDept(info.representativeDoc)) {
        count++;
      }
    });
    return count;
  }, [docMasterMap, isOwnerDept]);

  const countGeneral = useMemo(() => {
    let count = 0;
    docMasterMap.forEach(info => {
      if (info.masterStatus === 'ACTIVE' && !isOwnerDept(info.representativeDoc) && isGeneralDoc(info.representativeDoc)) {
        count++;
      }
    });
    return count;
  }, [docMasterMap, isOwnerDept]);

  const countDistributed = useMemo(() => {
    let count = 0;
    docMasterMap.forEach(info => {
      if (info.masterStatus === 'ACTIVE' && !isOwnerDept(info.representativeDoc) && !isGeneralDoc(info.representativeDoc) && hasDistributedCopyToUserDept(info.representativeDoc)) {
        count++;
      }
    });
    return count;
  }, [docMasterMap, isOwnerDept, hasDistributedCopyToUserDept]);

  const myDeptDocsCount = countMyDept;
  const generalDocsCount = countGeneral;
  const distributedDocsCount = countDistributed;

  // ─────────────────────────────────────────────────────────────
  // Dynamic Document Stacking Pipeline (Enterprise Grouping by docNo)
  // ─────────────────────────────────────────────────────────────
  const docStacks = useMemo(() => {
    const map = new Map();

    (categoryDocs || []).forEach(doc => {
      if (!isOfficialLifecycleDoc(doc)) return;
      const key = getCanonicalDocNo(doc);
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(doc);
    });

    const stacks = [];

    map.forEach((docs, docNo) => {
      // Sort editions: Active first, then by date descending
      const sortedEditions = [...docs].sort((a, b) => {
        const isActiveA = (a.status === 'ACTIVE' || a.status === 'EFFECTIVE') && !a.is_superseded && !a.is_obsolete && a.status !== 'SUPERSEDED' && a.status !== 'OBSOLETE';
        const isActiveB = (b.status === 'ACTIVE' || b.status === 'EFFECTIVE') && !b.is_superseded && !b.is_obsolete && b.status !== 'SUPERSEDED' && b.status !== 'OBSOLETE';
        if (isActiveA && !isActiveB) return -1;
        if (!isActiveA && isActiveB) return 1;

        const dateA = new Date(a.supersededAt || a.supersededDate || a.obsoleteDate || a.effectiveDate || a.createdAt || 0).getTime() || 0;
        const dateB = new Date(b.supersededAt || b.supersededDate || b.obsoleteDate || b.effectiveDate || b.createdAt || 0).getTime() || 0;
        return dateB - dateA;
      });

      const activeEdition = sortedEditions.find(d => 
        (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && 
        !d.is_superseded && 
        !d.is_obsolete && 
        d.status !== 'SUPERSEDED' && 
        d.status !== 'OBSOLETE'
      ) || null;

      // Superseded editions sorted in strict descending order by supersededAt / issueDate (EC-2 safe)
      const supersededEditions = sortedEditions
        .filter(d => d.status === 'SUPERSEDED' || d.status === 'SUPERSEDED_ARCHIVED' || d.is_superseded)
        .sort((a, b) => {
          const dateA = new Date(a.supersededAt || a.supersededDate || a.issueDate || a.effectiveDate || a.updatedAt || a.createdAt || 0).getTime() || 0;
          const dateB = new Date(b.supersededAt || b.supersededDate || b.issueDate || b.effectiveDate || b.updatedAt || b.createdAt || 0).getTime() || 0;
          return dateB - dateA;
        });

      // Obsolete editions
      const obsoleteEditions = sortedEditions
        .filter(d => d.status === 'OBSOLETE' || d.status === 'OBSOLETE_ARCHIVED' || d.is_obsolete)
        .sort((a, b) => {
          const dateA = new Date(a.obsoleteDate || a.effectiveDate || a.updatedAt || a.createdAt || 0).getTime() || 0;
          const dateB = new Date(b.obsoleteDate || b.effectiveDate || b.updatedAt || b.createdAt || 0).getTime() || 0;
          return dateB - dateA;
        });

      // Determine overall stack lifecycle status:
      // If ANY record in this stack is active, stack is ACTIVE.
      // If there are NO active editions and at least one is OBSOLETE (or all are OBSOLETE), stack is OBSOLETE.
      // Otherwise, if only superseded editions exist without an active or obsolete edition, it's SUPERSEDED.
      const isStackObsolete = !activeEdition && obsoleteEditions.length > 0;
      const stackStatus = activeEdition ? 'ACTIVE' : isStackObsolete ? 'OBSOLETE' : 'SUPERSEDED';

      // Authoritative representative doc for header display & fallback actions
      const primaryDoc = isStackObsolete 
        ? (obsoleteEditions[0] || sortedEditions[0]) 
        : (activeEdition || supersededEditions[0] || sortedEditions[0]);

      stacks.push({
        docNo,
        title: primaryDoc.title || primaryDoc.docTitle || primaryDoc.name || 'เอกสารภายนอก',
        titleTh: primaryDoc.titleTh || '',
        department: primaryDoc.department || primaryDoc.dept || 'QA',
        issuer: primaryDoc.issuer || primaryDoc.officialIssuer || primaryDoc.source || 'หน่วยงานภายนอก',
        category: primaryDoc.category || '',
        accessScope: primaryDoc.accessScope || primaryDoc.distributionScope || 'General',
        reviewCycleMonths: primaryDoc.reviewCycleMonths || 12,
        effectiveDate: primaryDoc.effectiveDate,
        nextReviewDate: primaryDoc.nextReviewDate,
        activeEdition,
        supersededEditions,
        obsoleteEditions,
        allEditions: sortedEditions,
        totalEditionsCount: sortedEditions.length,
        stackStatus,
        isStackObsolete,
        primaryDoc
      });
    });

    return stacks;
  }, [categoryDocs]);

  // Level 2 Compact Status Pill Badge Counts (Derived from Stacks + Total Copies)
  const statusCounts = useMemo(() => {
    const active = docStacks.filter(s => s.stackStatus === 'ACTIVE').length;
    // Superseded tab ONLY counts documents that are NOT obsolete and have superseded editions
    const superseded = docStacks.filter(s => s.stackStatus !== 'OBSOLETE' && s.supersededEditions.length > 0).length;
    const obsolete = docStacks.filter(s => s.stackStatus === 'OBSOLETE').length;
    const total = docStacks.length;

    const totalSupersededCopies = categoryDocs.filter(d => 
      (d.status === 'SUPERSEDED' || d.status === 'SUPERSEDED_ARCHIVED' || d.is_superseded) &&
      d.status !== 'OBSOLETE' && d.status !== 'OBSOLETE_ARCHIVED' && !d.is_obsolete
    ).length;

    return { 
      active, 
      superseded, 
      obsolete, 
      total,
      totalSupersededCopies 
    };
  }, [docStacks, categoryDocs]);

  // Global metrics stats for notifications & test compatibility
  const stats = useMemo(() => {
    let active = 0;
    let superseded = 0;
    let obsolete = 0;

    allExternalDocs.forEach(doc => {
      if ((doc.status === 'ACTIVE' || doc.status === 'EFFECTIVE') && !doc.is_superseded && !doc.is_obsolete && doc.status !== 'SUPERSEDED' && doc.status !== 'OBSOLETE') active++;
      else if (doc.status === 'OBSOLETE' || doc.status === 'OBSOLETE_ARCHIVED' || doc.is_obsolete) obsolete++;
      else if (doc.status === 'SUPERSEDED' || doc.status === 'SUPERSEDED_ARCHIVED' || doc.is_superseded) superseded++;
    });

    const total = active + superseded + obsolete;
    const pending = 0; // External document library never contains pending/in-flight requests
    const dueSoon = accessibleDocs.filter(d => {
      const v = getValidityInfo(d);
      return v.status === 'DUE_SOON' || v.status === 'OVERDUE';
    }).length;

    return { total, active, superseded, obsolete, pending, dueSoon };
  }, [allExternalDocs, accessibleDocs, getValidityInfo]);

  // Filtered Document Stacks (Status + Toolbar Filters + Deep Search Transitivity)
  const filteredStacks = useMemo(() => {
    return docStacks.filter(stack => {
      // 1. Status Filter in MY_DEPT (or Active in other main tabs)
      if (activeMainTab !== TAB_MY_DEPT) {
        if (stack.stackStatus !== 'ACTIVE') return false;
      } else {
        if (statusFilter === 'ACTIVE') {
          if (stack.stackStatus !== 'ACTIVE') return false;
        } else if (statusFilter === 'SUPERSEDED') {
          // Strictly exclude OBSOLETE documents from SUPERSEDED tab
          if (stack.stackStatus === 'OBSOLETE' || stack.supersededEditions.length === 0) return false;
        } else if (statusFilter === 'OBSOLETE') {
          // Obsolete tab shows stacks that are OBSOLETE
          if (stack.stackStatus !== 'OBSOLETE') return false;
        }
      }

      // 2. Department Filter (at parent stack level)
      if (deptFilter !== 'ALL' && !deptMatches(stack.department, deptFilter)) {
        return false;
      }

      // 3. Scope Filter
      if (scopeFilter !== 'ALL' && stack.accessScope !== scopeFilter) {
        return false;
      }

      // 4. Search Filter (Deep Search Transitivity - UC-4)
      if (searchTerm && searchTerm.trim()) {
        const { matches } = stackMatchesSearch(stack, searchTerm);
        if (!matches) return false;
      }

      return true;
    });
  }, [docStacks, activeMainTab, statusFilter, deptFilter, scopeFilter, searchTerm, deptMatches]);

  // Sorted Parent Document Stacks for Data Grid
  const displayStacks = useMemo(() => {
    return [...filteredStacks].sort((a, b) => {
      // In Superseded tab: sort by latest superseded edition date
      if (statusFilter === 'SUPERSEDED') {
        const dateA = new Date(a.supersededEditions[0]?.supersededAt || a.supersededEditions[0]?.effectiveDate || 0).getTime() || 0;
        const dateB = new Date(b.supersededEditions[0]?.supersededAt || b.supersededEditions[0]?.effectiveDate || 0).getTime() || 0;
        if (dateB !== dateA) return dateB - dateA;
      }
      // In Obsolete tab: sort by latest obsolete date
      if (statusFilter === 'OBSOLETE') {
        const dateA = new Date(a.obsoleteEditions[0]?.obsoleteDate || a.obsoleteEditions[0]?.effectiveDate || 0).getTime() || 0;
        const dateB = new Date(b.obsoleteEditions[0]?.obsoleteDate || b.obsoleteEditions[0]?.effectiveDate || 0).getTime() || 0;
        if (dateB !== dateA) return dateB - dateA;
      }
      // Default: sort by primary doc effective date descending, then docNo
      const dateA = new Date(a.primaryDoc?.effectiveDate || a.primaryDoc?.createdAt || 0).getTime() || 0;
      const dateB = new Date(b.primaryDoc?.effectiveDate || b.primaryDoc?.createdAt || 0).getTime() || 0;
      if (dateB !== dateA) return dateB - dateA;
      return a.docNo.localeCompare(b.docNo);
    });
  }, [filteredStacks, statusFilter]);

  // Backward compatible flattened list
  const filteredDocs = useMemo(() => {
    return filteredStacks.flatMap(s => s.allEditions);
  }, [filteredStacks]);

  // Universal Pagination Engine (Paginating over Parent Document Stacks - Invariant D)
  const pagination = useTablePagination(displayStacks, 10);

  // Active documents pool for Header Action Selectors (Strictly My Department documents or DCC)
  const selectableActiveDocs = useMemo(() => {
    return accessibleDocs.filter(d => (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && (isOwnerDept(d) || isDccAdmin));
  }, [accessibleDocs, isOwnerDept, isDccAdmin]);

  const filteredSelectableDocs = useMemo(() => {
    if (!selectorSearch.trim()) return selectableActiveDocs;
    const q = selectorSearch.toLowerCase();
    return selectableActiveDocs.filter(d => {
      const code = (d.edCode || d.doc_code || d.id || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      const titleTh = (d.titleTh || '').toLowerCase();
      return code.includes(q) || title.includes(q) || titleTh.includes(q);
    });
  }, [selectableActiveDocs, selectorSearch]);

  // Action Handlers
  const handleRegisterNew = () => {
    setOpenMenuDocId(null);
    setSelectModalMode(null);
    setIsDetailOpen(false);
    setIsPreviewOpen(false);
    setIsHistoryOpen(false);
    setIsHistoryModalOpen(false);
    setIsObsoleteModalOpen(false);
    setDocToEdit(null);
    setIsModalOpen(true);
  };

  const handleRevise = (doc) => {
    if (!doc) return;
    setOpenMenuDocId(null);
    setSelectModalMode(null);
    setIsDetailOpen(false);
    setIsPreviewOpen(false);
    setIsHistoryOpen(false);
    setIsHistoryModalOpen(false);
    setIsObsoleteModalOpen(false);
    setDocToEdit({ ...doc });
    setIsModalOpen(true);
  };

  const handleOpenDetail = (doc) => {
    setOpenMenuDocId(null);
    setDocToDetail(doc ? { ...doc } : null);
    setIsDetailOpen(true);
  };

  const handlePreview = (doc) => {
    setOpenMenuDocId(null);
    setDocToPreview(doc ? { ...doc } : null);
    setIsPreviewOpen(true);
  };

  const handleObsolete = (doc) => {
    if (!doc) return;
    setOpenMenuDocId(null);
    setSelectModalMode(null);
    setIsDetailOpen(false);
    setIsPreviewOpen(false);
    setIsHistoryOpen(false);
    setIsHistoryModalOpen(false);
    setIsModalOpen(false);
    setDocToObsolete({ ...doc });
    setIsObsoleteModalOpen(true);
  };

  // Deep-linking auto-open effects (Update / Obsolete / Detail)
  const handledDeepLinkKeyRef = useRef('');
  const deepLinkActionActiveRef = useRef(null);
  const deepLinkFromReviewRef = useRef(false);
  const deepLinkTargetCodeRef = useRef('');
  const initialRequestsCountRef = useRef(0);
  const initialTasksCountRef = useRef(0);

  useEffect(() => {
    const currentKey = `${deepLinkDocCode || ''}_${deepLinkDocId || ''}_${autoOpenUpdate}_${autoOpenObsolete}`;
    if (!deepLinkDocCode && !deepLinkDocId) return;
    if (handledDeepLinkKeyRef.current === currentKey) return;

    if ((externalDocuments || []).length > 0) {
      const targetCode = String(deepLinkDocCode || '').trim().toLowerCase();
      const matchingDocs = (externalDocuments || []).filter(d => {
        if (deepLinkDocId && String(d.id) === String(deepLinkDocId)) return true;
        if (!targetCode) return false;
        const candidates = [d.edCode, d.doc_code, d.document_code, d.code, d.docCode, d.docNo, d.id, d.documentNumber]
          .filter(Boolean)
          .map(c => String(c).trim().toLowerCase());
        return candidates.includes(targetCode);
      });

      const found = matchingDocs.find(d => (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && !d.is_superseded && !d.is_obsolete) || matchingDocs[0] || null;

      if (found) {
        handledDeepLinkKeyRef.current = currentKey;
        if (autoOpenUpdate) {
          deepLinkActionActiveRef.current = 'UPDATE';
          deepLinkFromReviewRef.current = Boolean(
            location.state?.fromPeriodicReview || 
            searchParams.get('fromPeriodicReview') === 'true' || 
            autoOpenUpdate
          );
          deepLinkTargetCodeRef.current = getDocCode(found) || found.edCode || found.doc_code || deepLinkDocCode || '';
          initialRequestsCountRef.current = (useStore.getState().externalRequests || []).length;
          initialTasksCountRef.current = (useStore.getState().tasks || []).length;
          handleRevise(found);
        } else if (autoOpenObsolete) {
          deepLinkActionActiveRef.current = 'OBSOLETE';
          deepLinkFromReviewRef.current = Boolean(
            location.state?.fromPeriodicReview || 
            searchParams.get('fromPeriodicReview') === 'true' || 
            autoOpenObsolete
          );
          deepLinkTargetCodeRef.current = getDocCode(found) || found.edCode || found.doc_code || deepLinkDocCode || '';
          initialRequestsCountRef.current = (useStore.getState().externalRequests || []).length;
          initialTasksCountRef.current = (useStore.getState().tasks || []).length;
          handleObsolete(found);
        } else {
          handleOpenDetail(found);
        }
      }
    }
  }, [deepLinkDocCode, deepLinkDocId, autoOpenUpdate, autoOpenObsolete, externalDocuments, location.state?.fromPeriodicReview, searchParams]);

  const cleanupDeepLinkParams = () => {
    handledDeepLinkKeyRef.current = '';
    deepLinkActionActiveRef.current = null;
    deepLinkFromReviewRef.current = false;

    // Clean URL search params so refresh does not re-open the modal
    if (typeof setSearchParams === 'function') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('autoOpenUpdate');
        next.delete('autoOpenObsolete');
        next.delete('openDocCode');
        next.delete('docCode');
        return next;
      }, { replace: true });
    }

    try {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('autoOpenUpdate');
      nextParams.delete('autoOpenObsolete');
      nextParams.delete('openDocCode');
      nextParams.delete('docCode');
      const q = nextParams.toString();
      navigate({ search: q ? `?${q}` : '' }, { replace: true, state: {} });
    } catch {
      // safe fallback
    }

    try {
      if (typeof window !== 'undefined' && window.location) {
        const url = new URL(window.location.href);
        url.searchParams.delete('autoOpenUpdate');
        url.searchParams.delete('autoOpenObsolete');
        url.searchParams.delete('openDocCode');
        url.searchParams.delete('docCode');
        window.history.replaceState({}, '', url.pathname + (url.search || ''));
      }
    } catch {
      // safe fallback
    }
  };

  const handleCloseFormModal = () => {
    const isAutoActive = Boolean(autoOpenUpdate || deepLinkActionActiveRef.current === 'UPDATE');
    const wasFromPeriodicReview = Boolean(
      deepLinkFromReviewRef.current || 
      location.state?.fromPeriodicReview || 
      searchParams.get('fromPeriodicReview') === 'true' ||
      autoOpenUpdate
    );

    const currentRequestsCount = (useStore.getState().externalRequests || []).length;
    const currentTasksCount = (useStore.getState().tasks || []).length;
    const isSubmitted = currentRequestsCount > initialRequestsCountRef.current || currentTasksCount > initialTasksCountRef.current;

    if (isAutoActive && !isSubmitted) {
      const targetCode = docToEdit?.edCode || docToEdit?.doc_code || deepLinkTargetCodeRef.current || deepLinkDocCode;
      const resetFn = resetPendingReviewIntent || useStore.getState().resetPendingReviewIntent;
      if (typeof resetFn === 'function') {
        resetFn(targetCode);
      }
      if (wasFromPeriodicReview) {
        toast('ยกเลิกการปรับปรุงเอกสารภายนอก สามารถกลับไปทบทวนใหม่ได้ที่หน้ารายการทบทวน');
      }
    }

    if (isAutoActive) {
      cleanupDeepLinkParams();
    }

    setIsModalOpen(false);
    setDocToEdit(null);
  };

  const handleCloseObsoleteModal = () => {
    const isAutoActive = Boolean(autoOpenObsolete || deepLinkActionActiveRef.current === 'OBSOLETE');
    const wasFromPeriodicReview = Boolean(
      deepLinkFromReviewRef.current || 
      location.state?.fromPeriodicReview || 
      searchParams.get('fromPeriodicReview') === 'true' ||
      autoOpenObsolete
    );

    const currentRequestsCount = (useStore.getState().externalRequests || []).length;
    const currentTasksCount = (useStore.getState().tasks || []).length;
    const isSubmitted = currentRequestsCount > initialRequestsCountRef.current || currentTasksCount > initialTasksCountRef.current;

    if (isAutoActive && !isSubmitted) {
      const targetCode = docToObsolete?.edCode || docToObsolete?.doc_code || deepLinkTargetCodeRef.current || deepLinkDocCode;
      const resetFn = resetPendingReviewIntent || useStore.getState().resetPendingReviewIntent;
      if (typeof resetFn === 'function') {
        resetFn(targetCode);
      }
      if (wasFromPeriodicReview) {
        toast('ยกเลิกการปรับปรุงเอกสารภายนอก สามารถกลับไปทบทวนใหม่ได้ที่หน้ารายการทบทวน');
      }
    }

    if (isAutoActive) {
      cleanupDeepLinkParams();
    }

    setIsObsoleteModalOpen(false);
    setDocToObsolete(null);
  };


  const handleHistory = (doc) => {
    setOpenMenuDocId(null);
    const code = getDocCode(doc);
    setSelectedHistoryDocCode(code);
    setDocToHistory(doc);
    setIsHistoryModalOpen(true);
    setIsHistoryOpen(true);
  };

  const handleRequestPhysicalCopy = (doc) => {
    setOpenMenuDocId(null);
    const resolvedEdCode = getDocCode(doc);
    const resolvedTitle = doc.title || doc.doc_title || doc.name || '';
    const resolvedEdition = doc.sourceVersion || doc.edition || doc.rev || '01';
    setSelectedDocForCopy({
      ...doc,
      id: doc.id,
      edCode: resolvedEdCode,
      doc_code: resolvedEdCode,
      code: resolvedEdCode,
      title: resolvedTitle,
      doc_title: resolvedTitle,
      name: resolvedTitle,
      sourceVersion: resolvedEdition,
      edition: resolvedEdition,
      rev: resolvedEdition,
      department: doc.department || uDept,
      is_external: true,
      doc_type: 'EXTERNAL'
    });
    setIsCopyModalOpen(true);
  };

  const handleOpenSelectDoc = (mode) => {
    setSelectorSearch('');
    setSelectModalMode(mode);
  };

  // Watermarked PDF Download Integration
  const handleDownload = async (doc, e) => {
    if (e) e.stopPropagation();
    setOpenMenuDocId(null);

    const isObsolete = doc.status === 'OBSOLETE' || doc.status === 'OBSOLETE_ARCHIVED' || doc.is_obsolete;
    const isSuperseded = doc.status === 'SUPERSEDED' || doc.status === 'SUPERSEDED_ARCHIVED' || doc.is_superseded;
    const watermarkPreset = isObsolete 
      ? WATERMARK_TYPES.OBSOLETE 
      : isSuperseded 
        ? WATERMARK_TYPES.SUPERSEDED 
        : WATERMARK_TYPES.UNCONTROLLED_COPY;

    const docCode = doc.edCode || doc.doc_code || doc.docNo || doc.id || 'ED-DOC-001';
    const toastId = toast.loading(`กำลังประทับลายน้ำเอกสารภายนอก ${docCode}...`);

    try {
      await UniversalWatermarkService.downloadWatermarkedPdf(
        {
          ...doc, // spread first so normalized code/status below win
          id: doc.id,
          title: docCode,
          name: doc.title,
          docTitle: doc.title,
          status: isObsolete ? 'OBSOLETE' : (isSuperseded ? 'SUPERSEDED' : (doc.status || 'ACTIVE')),
          isExternal: true,
        },
        watermarkPreset,
        {
          userName: currentUser?.name || 'User',
          userDept: uDept,
          reason: isObsolete ? 'Historical Download (OBSOLETE)' : (isSuperseded ? 'Historical Download (SUPERSEDED)' : 'External Document Download / Print'),
          location: uDept,
          watermarkType: watermarkPreset,
          isRestricted: doc.accessScope === 'Restricted' || doc.accessScope === 'RESTRICTED',
          accessScope: doc.accessScope,
          supersededByRev: doc.supersededByRev || 'Latest',
          obsoleteDate: doc.obsoleteDate || doc.supersededAt || '-'
        },
        false
      );

      toast.dismiss(toastId);
      toast.success(`ดาวน์โหลดเอกสารภายนอก ${docCode} สำเร็จ`);

      if (logExternalDownload) {
        logExternalDownload(doc.id);
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.dismiss(toastId);
      toast.error(error?.message || 'เกิดข้อผิดพลาดในการดาวน์โหลดเอกสาร');
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const csvHeaders = [
      'ลำดับ',
      'รหัสเอกสาร (ED Code)',
      'ชื่อเอกสารทางการ (Title)',
      'หน่วยงานผู้ออก/แหล่งที่มา (Issuing Org)',
      'เวอร์ชันต้นทาง (Edition/Version)',
      'แผนกผู้รับผิดชอบ (Responsible Dept)',
      'ระดับสิทธิ์การเข้าถึง (Access Level)',
      'วันที่มีผลบังคับใช้ (Effective Date)',
      'สถานะเอกสาร (Status)'
    ];
    const rows = [];
    let counter = 1;
    displayStacks.forEach(stack => {
      const editionsToExport = statusFilter === 'SUPERSEDED'
        ? stack.supersededEditions
        : statusFilter === 'OBSOLETE'
          ? stack.obsoleteEditions
          : statusFilter === 'ACTIVE'
            ? (stack.activeEdition ? [stack.activeEdition] : stack.allEditions)
            : stack.allEditions;

      editionsToExport.forEach(doc => {
        const code = stack.docNo || doc.edCode || doc.doc_code || doc.id || '-';
        const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
        rows.push([
          counter++,
          escape(code),
          escape(doc.title || stack.title || '-'),
          escape(doc.issuer || doc.issuingOrg || doc.source || stack.issuer || '-'),
          escape(doc.sourceVersion || doc.edition || '-'),
          escape(doc.department || stack.department || '-'),
          escape(doc.accessScope || stack.accessScope || 'General'),
          escape(doc.supersededAt ? String(doc.supersededAt).split('T')[0] : (doc.effectiveDate || doc.effective_date || '-')),
          escape(doc.status || '-')
        ].join(','));
      });
    });

    const csvContent = '\uFEFF' + [csvHeaders.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `External_Docs_${statusFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Render Status Badge
  const getStatusBadge = (doc) => {
    const status = doc.status;
    const isObsolete = status === 'OBSOLETE' || status === 'OBSOLETE_ARCHIVED' || doc.is_obsolete;
    const isSuperseded = status === 'SUPERSEDED' || status === 'SUPERSEDED_ARCHIVED' || doc.is_superseded;
    const isActive = status === 'ACTIVE' || status === 'EFFECTIVE';

    if (isActive) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#E6F7ED] text-[#14AE5C] border border-[#B3E7C9] whitespace-nowrap shadow-2xs">
          <CheckCircle2 size={13} strokeWidth={1.5} />
          <span>มีผลบังคับใช้</span>
        </span>
      );
    }
    if (isSuperseded) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] whitespace-nowrap shadow-2xs">
          <Clock size={13} strokeWidth={1.5} />
          <span>ฉบับตกรุ่น</span>
        </span>
      );
    }
    if (isObsolete) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] whitespace-nowrap shadow-2xs">
          <XCircle size={13} strokeWidth={1.5} />
          <span>ยกเลิกถาวร</span>
        </span>
      );
    }
    if (status === 'PENDING_EXT_REVIEW') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFF8E6] text-[#D49800] border border-[#FFE785] whitespace-nowrap shadow-2xs">
          <Clock size={13} strokeWidth={1.5} />
          <span>รอทบทวน</span>
        </span>
      );
    }
    if (status === 'PENDING_EXT_APPROVAL') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFF8E6] text-[#D49800] border border-[#FFE785] whitespace-nowrap shadow-2xs">
          <Clock size={13} strokeWidth={1.5} />
          <span>รออนุมัติ</span>
        </span>
      );
    }
    if (status === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FEECE8] text-[#F24822] border border-[#FAD3CC] whitespace-nowrap shadow-2xs">
          <X size={13} strokeWidth={1.5} />
          <span>ไม่อนุมัติ</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1] whitespace-nowrap">
        <span>{status || 'Draft'}</span>
      </span>
    );
  };


  return (
    <div className="w-full space-y-4 pb-12">
      {/* 1. Page Header Card with Scope Tabs & Primary Action (Standardized Page Header) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-xl px-6 py-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-slate-700 shrink-0" strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              คลังเอกสารภายนอก (External Document Library)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              ทะเบียนควบคุมมาตรฐานสากล กฎหมาย และคู่มือผู้ผลิตภายนอกตามข้อกำหนด ISO 9001:2015 Clause 7.5.3.2
            </p>
          </div>
        </div>

        {/* Scope Tabs & Primary Action Control (Symmetric with Master Document Library) */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* 3 Scope Tabs: Minimal Segmented Pills */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-lg overflow-x-auto shrink-0 text-xs">
            {/* Tab 1: เอกสารทั่วไป */}
            <button
              type="button"
              title="เอกสารส่วนกลาง / เอกสารทั่วไปของแผนกอื่น"
              aria-label="เอกสารทั่วไป (เอกสารส่วนกลาง / เอกสารทั่วไปของแผนกอื่น)"
              onClick={() => {
                setActiveMainTab(TAB_GENERAL);
                setStatusFilter('ACTIVE');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeMainTab === TAB_GENERAL
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
              }`}
            >
              <Globe size={13} className={activeMainTab === TAB_GENERAL ? 'text-blue-600' : 'text-slate-400'} />
              <span>เอกสารทั่วไป</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                activeMainTab === TAB_GENERAL ? 'bg-blue-50 text-blue-700 border border-blue-200/80' : 'bg-slate-200/80 text-slate-600'
              }`}>
                {generalDocsCount}
              </span>
            </button>

            {/* Tab 2: ในแผนกฉัน */}
            <button
              type="button"
              aria-label="เอกสารในแผนกฉัน"
              onClick={() => {
                setActiveMainTab(TAB_MY_DEPT);
                setStatusFilter('ACTIVE');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeMainTab === TAB_MY_DEPT
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
              }`}
            >
              <Building2 size={13} className={activeMainTab === TAB_MY_DEPT ? 'text-blue-600' : 'text-slate-400'} />
              <span>ในแผนกฉัน</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                activeMainTab === TAB_MY_DEPT ? 'bg-blue-50 text-blue-700 border border-blue-200/80' : 'bg-slate-200/80 text-slate-600'
              }`}>
                {myDeptDocsCount}
              </span>
            </button>

            {/* Tab 3: เอกสารที่ได้รับการแจกจ่าย */}
            <button
              type="button"
              aria-label="เอกสารที่ได้รับการแจกจ่าย"
              onClick={() => {
                setActiveMainTab(TAB_DISTRIBUTED);
                setStatusFilter('ACTIVE');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeMainTab === TAB_DISTRIBUTED
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
              }`}
            >
              <Share2 size={13} className={activeMainTab === TAB_DISTRIBUTED ? 'text-blue-600' : 'text-slate-400'} />
              <span>ได้รับการแจกจ่าย</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                activeMainTab === TAB_DISTRIBUTED ? 'bg-blue-50 text-blue-700 border border-blue-200/80' : 'bg-slate-200/80 text-slate-600'
              }`}>
                {distributedDocsCount}
              </span>
            </button>
          </div>

          {/* Primary Action Button: เด่น 1 ปุ่มสำหรับ "ลงทะเบียนเอกสารใหม่" */}
          <button
            type="button"
            aria-label="ลงทะเบียนเอกสารภายนอก"
            onClick={handleRegisterNew}
            className="h-10 px-4 text-xs sm:text-sm font-semibold text-white bg-[#0D99FF] hover:bg-[#007BE5] active:bg-[#0066BE] rounded-xl shadow-xs inline-flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <Plus size={16} strokeWidth={2.2} />
            <span>ลงทะเบียนเอกสารใหม่</span>
          </button>
        </div>
      </div>

      {/* Sub-Metric Awareness Indicator (สำหรับแสดงงานที่รอพิจารณา และใกล้ครบกำหนด) */}
      {(stats.pending > 0 || stats.dueSoon > 0) && (
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-2 bg-amber-50/60 border border-amber-200/70 rounded-xl text-xs text-amber-800">
          <span className="font-bold flex items-center gap-1">
            <AlertTriangle size={14} className="text-amber-600" />
            <span>การแจ้งเตือนงานเอกสาร:</span>
          </span>
          {stats.pending > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold font-mono text-[11px]">
              รอทบทวน/อนุมัติ: {stats.pending} ฉบับ
            </span>
          )}
          {stats.dueSoon > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 font-semibold font-mono text-[11px]">
              ใกล้/เกินกำหนดทบทวน: {stats.dueSoon} ฉบับ
            </span>
          )}
        </div>
      )}

      {/* 3. Main Data Card with Filter Toolbar & Bento Data Grid (Full Width) */}
      <div className="w-full bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-2xs h-auto space-y-0">
        {/* Enterprise Control Toolbar: 2-Row Clean Layout */}
        <div className="p-4 border-b border-slate-200/80 bg-white space-y-3.5">
          {/* แถวที่ 1: ค้นหา + แผนก + ระดับสิทธิ์ + ปุ่ม Action รอง + ปุ่มส่งออก CSV */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
            {/* ช่องค้นหาเอกสาร (ขยายตามพื้นที่ว่างที่เหลือ) */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              <input
                type="text"
                placeholder="ค้นหารหัส ED, ชื่อ, แหล่งที่มา..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 text-sm placeholder:text-slate-400 pl-9 pr-10 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-slate-800 focus:outline-none transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <FilterX size={15} />
                </button>
              )}
            </div>

            {/* Dropdown 1: แผนก (Department Filter) */}
            <div className="w-full lg:w-44 shrink-0">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-slate-50 hover:bg-white border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-slate-700 focus:outline-none transition-all cursor-pointer"
              >
                <option value="ALL">ทุกแผนก (All Depts)</option>
                {availableDepts.map(deptObj => {
                  const deptCode = typeof deptObj === 'string' ? deptObj : deptObj.id;
                  const deptName = typeof deptObj === 'string' ? deptObj : (deptObj.nameTh || deptObj.name);
                  return (
                    <option key={deptCode} value={deptCode}>{deptCode} - {deptName}</option>
                  );
                })}
              </select>
            </div>

            {/* Dropdown 2: ระดับสิทธิ์การเข้าถึง */}
            <div className="w-full lg:w-40 shrink-0">
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-slate-50 hover:bg-white border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-slate-700 focus:outline-none transition-all cursor-pointer"
              >
                <option value="ALL">ทุกระดับสิทธิ์</option>
                <option value="General">ทั่วไป (General)</option>
                <option value="Department">เฉพาะแผนก (Dept Only)</option>
                <option value="Restricted">จำกัดสิทธิ์ (Restricted)</option>
              </select>
            </div>

            {/* ปุ่ม Action รอง (อัปเดต, ยกเลิก, คำร้อง) และ ปุ่มส่งออก CSV */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Action 2: อัปเดตฉบับใหม่ */}
              <button
                type="button"
                onClick={() => handleOpenSelectDoc('UPDATE')}
                className="h-10 px-3 text-sm font-semibold bg-white text-slate-700 border border-slate-200 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50/50 rounded-lg shadow-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="เลือกเอกสารภายนอกเพื่อขอปรับปรุงเวอร์ชันใหม่"
              >
                <RotateCw size={15} className="text-amber-600" />
                <span>อัปเดต</span>
              </button>

              {/* Action 3: ยกเลิกการใช้งาน */}
              <button
                type="button"
                onClick={() => handleOpenSelectDoc('OBSOLETE')}
                className="h-10 px-3 text-sm font-semibold bg-white text-slate-700 border border-slate-200 hover:border-rose-300 hover:text-rose-700 hover:bg-rose-50/50 rounded-lg shadow-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="เลือกเอกสารภายนอกเพื่อขอยกเลิกการใช้งานถาวร"
              >
                <Archive size={15} className="text-rose-600" />
                <span>ยกเลิก</span>
              </button>

              {/* Action 4: คำร้องเอกสารภายนอกของฉัน */}
              <button
                type="button"
                onClick={() => navigate('/dcc/external/my-requests')}
                className="h-10 px-3 text-sm font-semibold bg-white text-slate-700 border border-slate-200 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50/50 rounded-lg shadow-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="ติดตามสถานะคำร้องเอกสารภายนอกของฉัน"
              >
                <FileText size={15} className="text-sky-600" />
                <span>คำร้อง</span>
                {myReviseCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-rose-500 text-white rounded-full">
                    {myReviseCount}
                  </span>
                )}
              </button>

              <div className="h-6 w-px bg-slate-200 mx-0.5 hidden sm:block" />

              {/* ปุ่มส่งออกรายงาน CSV */}
              <button
                type="button"
                onClick={handleExportCsv}
                className="h-10 px-3.5 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 rounded-lg shadow-xs transition-all whitespace-nowrap cursor-pointer"
              >
                <Download className="text-slate-500 shrink-0" size={15} />
                <span>ส่งออก</span>
              </button>
            </div>
          </div>

          {/* แถวที่ 2: Compact Segmented Pill Control (แสดงเฉพาะเมื่อเลือกแท็บ 'เอกสารในแผนกฉัน' ตามมาตรฐาน ISO) */}
          {activeMainTab === TAB_MY_DEPT ? (
            <div className="pt-2.5 border-t border-[#F1F5F9] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Responsive Scrollable & Wrap Capsule Pill Container */}
              <div className="w-full sm:w-auto overflow-x-auto scrollbar-hide py-0.5">
                <div className="inline-flex p-1 bg-slate-100/80 rounded-xl gap-1 shrink-0 whitespace-nowrap">
                  {[
                    { id: 'ACTIVE', label: 'มีผลบังคับใช้ (Active)', count: statusCounts.active },
                    { id: 'SUPERSEDED', label: 'ฉบับตกรุ่น (Superseded)', count: statusCounts.superseded },
                    { id: 'OBSOLETE', label: 'ยกเลิกถาวร (Obsolete)', count: statusCounts.obsolete },
                  ].map((tab) => {
                    const isSelected = statusFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id)}
                        className={`cursor-pointer flex items-center whitespace-nowrap shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-white text-slate-900 shadow-xs font-medium rounded-lg px-3 py-1.5 text-xs'
                            : 'text-slate-500 hover:text-slate-800 rounded-lg px-3 py-1.5 text-xs'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] bg-slate-200/70 text-slate-700 font-mono">
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-[#64748B] shrink-0">
                {(deptFilter !== 'ALL' || scopeFilter !== 'ALL' || searchTerm || statusFilter !== 'ACTIVE') && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('ACTIVE');
                      setDeptFilter('ALL');
                      setScopeFilter('ALL');
                      setSearchTerm('');
                    }}
                    className="text-[#EF4444] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <FilterX size={13} />
                    <span>ล้างตัวกรองทั้งหมด</span>
                  </button>
                )}
                <span className="font-mono">
                  แสดงผล <strong className="text-[#1E293B] font-bold">{pagination.totalItems}</strong> จาก {statusFilter === 'SUPERSEDED' ? statusCounts.superseded : statusFilter === 'ACTIVE' ? statusCounts.active : statusFilter === 'OBSOLETE' ? statusCounts.obsolete : statusCounts.total} รายการ (เอกสารแม่)
                </span>
              </div>
            </div>
          ) : (
            /* สำหรับแท็บ 'เอกสารทั่วไป' และ 'เอกสารที่ได้รับการแจกจ่าย' - ซ่อนแถบแท็บย่อยวงจรชีวิตออกไปโดยสิ้นเชิง */
            (deptFilter !== 'ALL' || scopeFilter !== 'ALL' || searchTerm) ? (
              <div className="pt-2.5 border-t border-[#F1F5F9] flex items-center justify-between text-xs text-[#64748B]">
                <button
                  type="button"
                  onClick={() => {
                    setDeptFilter('ALL');
                    setScopeFilter('ALL');
                    setSearchTerm('');
                  }}
                  className="text-[#EF4444] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <FilterX size={13} />
                  <span>ล้างตัวกรองทั้งหมด</span>
                </button>
                <span className="font-mono">
                  แสดงผล <strong className="text-[#1E293B] font-bold">{filteredDocs.length}</strong> จาก {categoryDocs.length} รายการ (เฉพาะฉบับมีผลบังคับใช้)
                </span>
              </div>
            ) : null
          )}
        </div>

        {/* Bento Data Grid Table */}
        <div className="w-full flex-1 overflow-y-auto overflow-x-auto min-h-[320px] pb-6 scrollbar-thin">
          <table className="w-full text-left text-sm table-auto min-w-full border-collapse">
            <thead className="bg-[#F8FAFC] text-[#374151] font-bold text-xs uppercase tracking-wider border-b border-[#E2E8F0] sticky top-0 z-20 whitespace-nowrap backdrop-blur-xs shadow-xs">
              <tr>
                <th className={`${statusFilter === 'OBSOLETE' ? 'w-[36%]' : 'w-[30%]'} min-w-[220px] py-3 px-3.5 select-none bg-[#F8FAFC]`}>รหัสและชื่อเอกสาร</th>
                <th className="w-[15%] min-w-[120px] py-3 px-3.5 select-none bg-[#F8FAFC]">แผนกและสิทธิ์</th>
                <th className="w-[16%] min-w-[130px] py-3 px-3.5 select-none bg-[#F8FAFC]">เวอร์ชันต้นทาง (EDITION / VER.)</th>
                <th className="w-[18%] min-w-[150px] py-3 px-3.5 select-none bg-[#F8FAFC]">
                  {statusFilter === 'SUPERSEDED' ? 'การแทนที่และประวัติ' : 'รอบทบทวนและความถูกต้อง'}
                </th>
                <th className="w-[13%] min-w-[120px] py-3 px-3.5 text-center select-none bg-[#F8FAFC]">สถานะเอกสาร</th>
                {statusFilter !== 'OBSOLETE' && (
                  <th className="w-[84px] min-w-[84px] py-3 px-3 text-right select-none bg-[#F8FAFC]">การจัดการ</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {pagination.paginatedData.length > 0 ? (
                pagination.paginatedData.map((stack, idx) => {
                  const doc = statusFilter === 'SUPERSEDED' ? (stack.supersededEditions[0] || stack.primaryDoc) : stack.primaryDoc;
                  const validity = getValidityInfo(doc);
                  const isActive = doc.status === 'ACTIVE' || doc.status === 'EFFECTIVE';
                  const isMenuOpen = openMenuDocId === doc.id;

                  const totalRows = pagination.paginatedData.length;
                  const isLastRow = idx === totalRows - 1;
                  const isFewRows = totalRows < 3;
                  const isNearBottom = idx >= Math.max(0, totalRows - 2);
                  const isDropup = isLastRow || isFewRows || isNearBottom;

                  const handleRowClick = () => {
                    if (statusFilter === 'SUPERSEDED') {
                      handleOpenSupersededModal(stack);
                    } else {
                      handleOpenDetail(doc);
                    }
                  };

                  return (
                    <tr 
                      key={stack.docNo || `${doc.id}-${idx}`}
                      className={`hover:bg-[#F8FAFC] transition-colors duration-150 cursor-pointer group ${
                        isMenuOpen ? 'relative z-50 bg-[#F8FAFC]' : 'relative'
                      } ${
                        statusFilter === 'SUPERSEDED' || doc.status === 'SUPERSEDED' || doc.is_superseded
                          ? 'border-l-4 border-l-amber-400 bg-amber-50/15 hover:bg-amber-50/30'
                          : doc.status === 'OBSOLETE' || doc.is_obsolete
                            ? 'border-l-4 border-l-slate-400 bg-slate-50/30 hover:bg-slate-100/40'
                            : 'border-l-4 border-l-transparent'
                      }`}
                      onClick={handleRowClick}
                    >
                      {/* 1. รหัสและชื่อเอกสาร (Document Identity & Stack Badge) */}
                      <td className="py-3 px-3.5 align-middle">
                        <div className="flex flex-col gap-1">
                          {/* ชั้นที่ 1 (Identity & History) */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-[#0D99FF] bg-[#E5F4FF] border border-[#B8E1FF] px-2.5 py-0.5 rounded-md inline-block shadow-2xs">
                              {stack.docNo}
                            </span>

                            {/* แสดงเฉพาะรายการที่มีฉบับประวัติ/ตกรุ่นเท่านั้น ถ้าไม่มีให้ซ่อน */}
                            {stack.supersededEditions?.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => handleOpenSupersededModal(stack, e)}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200/80 hover:text-slate-800 transition-all cursor-pointer"
                                title={`คลิกเพื่อดูรายการฉบับประวัติ/ตกรุ่นทั้งหมด (${stack.supersededEditions.length} ฉบับ)`}
                              >
                                <Package size={12} className="text-slate-500" />
                                <span>{stack.supersededEditions.length} ฉบับประวัติ</span>
                              </button>
                            )}
                          </div>

                          {/* ชั้นที่ 2 (Document Title) */}
                          <div 
                            className="font-semibold text-slate-900 text-sm leading-relaxed truncate max-w-md group-hover:text-[#0D99FF] transition-colors" 
                            title={stack.title}
                          >
                            {stack.title}
                          </div>

                          {/* ชั้นที่ 3 (Issuer Metadata) */}
                          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                            <span className="inline-flex items-center gap-1 font-medium">
                              <Building2 size={12} className="text-slate-400" />
                              {stack.issuer}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 3. แผนกและสิทธิ์การเข้าถึง */}
                      <td className="py-3 px-3.5 align-middle">
                        <div className="flex flex-col items-start gap-1">
                          {(() => {
                            const deptVal = doc.department || 'ส่วนกลาง';
                            const style = getDeptBadgeStyle(deptVal);
                            return (
                              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${style.badge}`}>
                                <Building2 className={`w-3 h-3 shrink-0 ${style.icon}`} />
                                <span>{deptVal}</span>
                              </span>
                            );
                          })()}
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border ${
                            doc.accessScope === 'Restricted' 
                              ? 'bg-amber-50 text-amber-700 border-amber-200' 
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {doc.accessScope === 'Restricted' ? <Lock size={10} /> : <Globe size={10} />}
                            {doc.accessScope === 'Restricted' ? 'จำกัดสิทธิ์' : 'ทั่วไป'}
                          </span>
                        </div>
                      </td>

                      {/* 4. เวอร์ชันต้นทาง และวันที่ */}
                      <td className="py-3 px-3.5 align-middle">
                        <div className="flex flex-col items-start gap-0.5">
                          {statusFilter === 'SUPERSEDED' ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => handleOpenSupersededModal(stack, e)}
                                className="font-mono font-bold text-xs text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/90 hover:bg-amber-100 hover:border-amber-300 transition-all cursor-pointer"
                                title="คลิกเพื่อดูรายการฉบับตกรุ่นทั้งหมด"
                              >
                                {stack.supersededEditions[0]?.sourceVersion || stack.supersededEditions[0]?.edition || 'ฉบับตกรุ่น'}
                              </button>
                              <span className="font-mono text-xs text-slate-500 mt-1" title="วันที่ปลดระวาง/ตกรุ่น">
                                {fmtDate(stack.supersededEditions[0]?.supersededAt || stack.supersededEditions[0]?.effectiveDate)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-mono font-bold text-xs text-indigo-900 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-200">
                                {doc.sourceVersion || doc.edition || 'ฉบับต้นทาง'}
                              </span>
                              <span className="font-mono text-xs text-slate-500 mt-1" title={doc.status === 'SUPERSEDED' || doc.is_superseded ? "วันที่ปลดระวาง/ตกรุ่น" : doc.status === 'OBSOLETE' || doc.is_obsolete ? "วันที่ยกเลิก" : "วันที่ออกเอกสารต้นทาง (Issue Date)"}>
                                {doc.status === 'SUPERSEDED' || doc.is_superseded
                                  ? fmtDate(doc.supersededAt || doc.effectiveDate)
                                  : doc.status === 'OBSOLETE' || doc.is_obsolete
                                    ? `ยกเลิก: ${fmtDate(doc.obsoleteDate || doc.effectiveDate)}`
                                    : fmtDate(doc.effectiveDate)}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 5. รอบทบทวนและความถูกต้อง / การแทนที่และประวัติ */}
                      <td className="py-3 px-3.5 align-middle">
                        {stack.isStackObsolete || stack.stackStatus === 'OBSOLETE' || doc.status === 'OBSOLETE' || doc.is_obsolete ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-xs text-slate-700 font-medium">
                              ยกเลิกการใช้งานแล้ว
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                              <Archive size={11} strokeWidth={1.5} className="text-rose-600" />
                              <span>ยกเลิกถาวร (Obsolete)</span>
                            </span>
                          </div>
                        ) : statusFilter === 'SUPERSEDED' || doc.status === 'SUPERSEDED' || doc.is_superseded ? (
                          <div className="flex flex-col items-start gap-0.5 text-xs">
                            {stack.activeEdition ? (
                              <span className="font-semibold text-slate-800 flex items-center gap-1">
                                <span className="text-slate-400 font-normal">แทนที่โดย:</span>
                                <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/80">
                                  {stack.activeEdition.sourceVersion || stack.activeEdition.edition || 'ฉบับปัจจุบัน'}
                                </span>
                              </span>
                            ) : (
                              <span className="font-medium text-slate-700">
                                ฉบับตกรุ่นสะสม
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400">
                              {stack.activeEdition?.effectiveDate ? `มีผล: ${fmtDate(stack.activeEdition.effectiveDate)}` : 'จัดเก็บในประวัติถาวร'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-xs text-slate-700 font-medium">
                              ทุก {doc.reviewCycleMonths || 12} เดือน
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${validity.colorClass}`}>
                              {validity.status === 'OVERDUE' && <AlertTriangle size={11} strokeWidth={1.5} />}
                              {validity.status === 'DUE_SOON' && <Clock size={11} strokeWidth={1.5} />}
                              {validity.status === 'NORMAL' && <CheckCircle size={11} strokeWidth={1.5} />}
                              {validity.label}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 6. สถานะเอกสาร */}
                      <td className="py-3 px-3.5 align-middle text-center whitespace-nowrap">
                        {stack.isStackObsolete || stack.stackStatus === 'OBSOLETE' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] whitespace-nowrap shadow-2xs">
                            <XCircle size={13} strokeWidth={1.5} />
                            <span>ยกเลิกถาวร</span>
                          </span>
                        ) : statusFilter === 'SUPERSEDED' ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] whitespace-nowrap shadow-2xs"
                          >
                            <Clock size={13} strokeWidth={1.5} />
                            <span>ตกรุ่น (Superseded)</span>
                          </span>
                        ) : (
                          getStatusBadge(doc)
                        )}
                      </td>

                      {/* 6. เครื่องมือและการจัดการ (Action Dock with direct buttons + 3-dot dropdown - Far Right) */}
                      {statusFilter !== 'OBSOLETE' && (
                        <td className={`px-2.5 py-3 whitespace-nowrap text-xs text-right ${isMenuOpen ? 'relative z-50' : 'relative z-1'}`} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1 ed-action-dock">
                            {/* Quick View Details Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenDetail(doc)}
                              className="p-1.5 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="ดูข้อมูลเอกสาร (View Details)"
                            >
                              <Eye size={14} strokeWidth={1.5} />
                            </button>

                            {/* Quick Watermarked Download Button */}
                            <button
                              type="button"
                              onClick={(e) => handleDownload(doc, e)}
                              className="p-1.5 rounded text-slate-500 hover:text-emerald-600 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="ดาวน์โหลด PDF พร้อมลายน้ำ (Watermarked PDF)"
                            >
                              <Download size={14} strokeWidth={1.5} />
                            </button>

                            {/* 3-Dot More Options Dropdown */}
                            <div className="relative">
                              <button
                                type="button"
                                aria-label="เมนูเพิ่มเติม"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuDocId(isMenuOpen ? null : doc.id);
                                }}
                                className={`p-1.5 rounded transition-colors cursor-pointer ${
                                  isMenuOpen
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                                title="เมนูการจัดการเพิ่มเติม (Row-Level Actions)"
                              >
                                <MoreHorizontal size={14} strokeWidth={1.5} />
                              </button>

                              {/* Dropdown Menu Popup (Dropup / Smart Placement Support) */}
                              {isMenuOpen && (
                                <div 
                                  className={`absolute right-0 ${
                                    isDropup ? 'bottom-full mb-2' : 'top-full mt-2'
                                  } w-60 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 py-1.5 text-left ed-dropdown-menu divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* Group 1: Core View Actions */}
                                  <div className="py-1">
                                    {/* 1. ดูข้อมูลเอกสาร (View Details) */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDetail(doc)}
                                      className="w-full px-3.5 py-2 text-xs text-slate-700 hover:text-[#0D99FF] hover:bg-[#F0F7FF] flex items-center gap-2.5 transition-all duration-150 font-medium cursor-pointer group/item"
                                    >
                                      <FileText size={15} strokeWidth={1.5} className="text-[#0D99FF] group-hover/item:scale-110 transition-transform" />
                                      <span>ดูข้อมูลเอกสาร (View Details)</span>
                                    </button>

                                    {/* 2. เปิดอ่านไฟล์ PDF (View PDF) */}
                                    <button
                                      type="button"
                                      onClick={() => handlePreview(doc)}
                                      className="w-full px-3.5 py-2 text-xs text-slate-700 hover:text-emerald-600 hover:bg-emerald-50/70 flex items-center gap-2.5 transition-all duration-150 font-medium cursor-pointer group/item"
                                    >
                                      <Eye size={15} strokeWidth={1.5} className="text-emerald-600 group-hover/item:scale-110 transition-transform" />
                                      <span>เปิดอ่านไฟล์ PDF (View PDF)</span>
                                    </button>
                                  </div>

                                  {/* Group 2: Lifecycle Actions (Update & Obsolete) */}
                                  {canManageDoc(doc) && (
                                    <div className="py-1">
                                      {/* 3. ขออัปเดตฉบับใหม่ */}
                                      <button
                                        type="button"
                                        onClick={() => handleRevise(doc)}
                                        className="w-full px-3.5 py-2 text-xs text-slate-700 hover:text-amber-600 hover:bg-amber-50/70 flex items-center gap-2.5 transition-all duration-150 font-medium cursor-pointer group/item"
                                        title="ขออัปเดตฉบับใหม่จากต้นทาง"
                                      >
                                        <RotateCw size={15} strokeWidth={1.5} className="text-amber-600 group-hover/item:rotate-45 transition-transform" />
                                        <span>ขออัปเดตฉบับใหม่ (Update External Edition)</span>
                                      </button>

                                      {/* 4. ยื่นขอยกเลิกใช้งาน */}
                                      {isActive && (
                                        <button
                                          type="button"
                                          onClick={() => handleObsolete(doc)}
                                          className="w-full px-3.5 py-2 text-xs text-slate-700 hover:text-rose-600 hover:bg-rose-50/70 flex items-center gap-2.5 transition-all duration-150 font-medium cursor-pointer group/item"
                                          title="ยื่นขอยกเลิกเอกสาร"
                                        >
                                          <Archive size={15} strokeWidth={1.5} className="text-rose-600 group-hover/item:scale-110 transition-transform" />
                                          <span>ยื่นขอยกเลิกใช้งาน (Request Obsolete)</span>
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Group 3: Controlled Copies & Download Actions */}
                                  <div className="py-1">
                                    {isActive && (
                                      <button
                                        type="button"
                                        onClick={() => handleRequestPhysicalCopy(doc)}
                                        className="w-full px-3.5 py-2 text-xs text-slate-700 hover:text-indigo-600 hover:bg-indigo-50/70 flex items-center gap-2.5 transition-all duration-150 font-medium cursor-pointer group/item"
                                        title="ขอสำเนาควบคุมหน้างาน (Request Physical Copy)"
                                      >
                                        <Layers size={15} strokeWidth={1.5} className="text-indigo-600 group-hover/item:scale-110 transition-transform" />
                                        <span>ขอสำเนาควบคุมหน้างาน</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => handleDownload(doc, e)}
                                      className="w-full px-3.5 py-2 text-xs text-slate-700 hover:text-emerald-600 hover:bg-emerald-50/70 flex items-center gap-2.5 transition-all duration-150 font-medium cursor-pointer group/item"
                                    >
                                      <Download size={15} strokeWidth={1.5} className="text-emerald-600 group-hover/item:scale-110 transition-transform" />
                                      <span>ดาวน์โหลด PDF (มีลายน้ำ)</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleHistory(doc)}
                                      className="w-full px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2.5 transition-all duration-150 font-medium cursor-pointer group/item"
                                    >
                                      <History size={15} strokeWidth={1.5} className="text-slate-400 group-hover/item:scale-110 transition-transform" />
                                      <span>ประวัติเอกสารและการแก้ไข</span>
                                    </button>

                                    {stack.supersededEditions.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={(e) => handleOpenSupersededModal(stack, e)}
                                        className="w-full px-3.5 py-2 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-50/70 flex items-center gap-2.5 transition-all duration-150 font-medium cursor-pointer group/item"
                                      >
                                        <Package size={15} strokeWidth={1.5} className="text-amber-600 group-hover/item:scale-110 transition-transform" />
                                        <span>ประวัติฉบับตกรุ่น ({stack.supersededEditions.length} ฉบับ)</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }).concat(
                  <tr key="table-safety-spacer" aria-hidden="true" className="h-4 border-none pointer-events-none select-none">
                    <td colSpan={statusFilter === 'OBSOLETE' ? 5 : 6} className="p-0 h-4 border-none" />
                  </tr>
                )
              ) : (
                <tr>
                  <td colSpan={statusFilter === 'OBSOLETE' ? 5 : 6} className="py-12 text-center">
                    <Globe className="w-10 h-10 text-slate-300 mx-auto mb-2" strokeWidth={1.5} />
                    <p className="text-sm text-slate-500 font-medium">ไม่พบเอกสารในหมวดหมู่นี้</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        <TablePagination
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </div>

      {/* ───────────────────────────────────────────────────────────────────────────── */}
      {/* 4. Document Selection Modal (When clicking Update Revision or Obsolete from Header) */}
      {/* ───────────────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectModalMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectModalMode(null)}
              className="fixed inset-0"
            />
            <motion.div 
              initial={{ scale: 0.96, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 15 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="relative bg-white border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] rounded-2xl shadow-2xl z-10 my-auto animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${
                    selectModalMode === 'UPDATE' ? 'bg-amber-100 text-[#D97706]' : 'bg-rose-100 text-[#DC2626]'
                  }`}>
                    {selectModalMode === 'UPDATE' ? <RotateCw size={18} /> : <Archive size={18} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-[#1E293B]">
                      {selectModalMode === 'UPDATE' ? 'เลือกเอกสารเพื่ออัปเดตฉบับใหม่' : 'เลือกเอกสารเพื่อขอยกเลิกการใช้งาน'}
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      {selectModalMode === 'UPDATE'
                        ? 'เลือกเอกสารภายนอกที่มีผลบังคับใช้ เพื่อจัดทำ Revision ถัดไป'
                        : 'เลือกเอกสารภายนอกที่มีผลบังคับใช้ เพื่อส่งคำขอยกเลิกถาวร'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectModalMode(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search in Selector */}
              <div className="p-4 border-b border-[#E2E8F0] bg-white">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="พิมพ์รหัส ED หรือ ชื่อเอกสารเพื่อค้นหา..."
                    value={selectorSearch}
                    onChange={(e) => setSelectorSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-[#0D99FF]"
                    autoFocus
                  />
                </div>
              </div>

              {/* Documents List */}
              <div className="p-4 overflow-y-auto flex-1 space-y-2 divide-y divide-slate-100 custom-scrollbar">
                {filteredSelectableDocs.length > 0 ? (
                  filteredSelectableDocs.map(doc => {
                    const code = doc.edCode || doc.doc_code || doc.id;
                    return (
                      <div
                        key={doc.id}
                        className="pt-2 pb-2 first:pt-0 flex items-center justify-between gap-3 hover:bg-slate-50 p-2.5 rounded-xl transition-all"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-xs text-[#0D99FF] bg-[#E5F4FF] px-2 py-0.5 rounded border border-[#B8E1FF]">
                              {code}
                            </span>
                            <span className="font-mono text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-bold">
                              {doc.sourceVersion || doc.edition || 'ฉบับต้นทาง'}
                            </span>
                            <span className="text-xs px-2 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                              {doc.department || 'QA'}
                            </span>
                          </div>
                          <p className="font-medium text-xs sm:text-sm text-[#1E293B] mt-1 truncate">
                            {doc.title}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectModalMode(null);
                            if (selectModalMode === 'UPDATE') {
                              handleRevise(doc);
                            } else {
                              handleObsolete(doc);
                            }
                          }}
                          className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                            selectModalMode === 'UPDATE'
                              ? 'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] hover:bg-[#FEF3C7]'
                              : 'bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] hover:bg-[#FEE2E2]'
                          }`}
                        >
                          <span>เลือกฉบับนี้</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-10 text-center text-slate-400">
                    <AlertCircle size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-xs font-semibold text-slate-600">ไม่พบเอกสารที่มีผลบังคับใช้ตรงกับคำค้นหา</p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectModalMode(null)}
                  className="btn-secondary text-sm font-semibold px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  ปิด (Close)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ───────────────────────────────────────────────────────────────────────────── */}
      {/* 5. Connected Workflows & Operations Modals */}
      {/* ───────────────────────────────────────────────────────────────────────────── */}
      <ErrorBoundary
        fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-200 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 mx-auto flex items-center justify-center mb-3">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">เกิดข้อผิดพลาดในการแสดงแบบฟอร์มเอกสาร</h3>
              <p className="text-xs text-slate-500 mb-4">ระบบป้องกันหน้าจอขาวอัตโนมัติ กรุณาลองใหม่อีกครั้ง</p>
              <button
                type="button"
                onClick={handleCloseFormModal}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        }
      >
        <ExternalDocFormModal
          isOpen={isModalOpen}
          onClose={handleCloseFormModal}
          documentToEdit={docToEdit}
        />
      </ErrorBoundary>

      <ExternalDocHistoryModal
        isOpen={isHistoryModalOpen || isHistoryOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setIsHistoryOpen(false);
          setSelectedHistoryDocCode(null);
          setDocToHistory(null);
        }}
        docCode={selectedHistoryDocCode}
        document={docToHistory}
        onViewActiveDoc={(activeDoc) => {
          setIsHistoryModalOpen(false);
          setIsHistoryOpen(false);
          setSelectedHistoryDocCode(null);
          setDocToHistory(null);
          handleOpenDetail(activeDoc);
        }}
      />

      <ExternalDocObsoleteModal
        isOpen={isObsoleteModalOpen}
        onClose={handleCloseObsoleteModal}
        documentToObsolete={docToObsolete}
      />

      {/* Level 1 Modal: Superseded Editions List Dialog (z-50) */}
      <ExternalDocSupersededModal
        isOpen={isSupersededModalOpen}
        onClose={() => {
          setIsSupersededModalOpen(false);
          setSelectedDocForSupersededModal(null);
        }}
        docGroup={selectedDocForSupersededModal}
        isChildModalOpen={isDetailOpen || isPreviewOpen}
        onPreview={(editionDoc) => {
          handlePreview(editionDoc);
        }}
        onDownload={(editionDoc, e) => {
          handleDownload(editionDoc, e);
        }}
        onOpenDetail={(editionDoc) => {
          // Open detail for this snapshot without closing the superseded modal
          handleOpenDetail(editionDoc);
        }}
      />

      {/* Level 2 Modals: Document Details & PDF Viewer (z-[60], renders on top of Level 1) */}
      <ExternalDocDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDocToDetail(null);
        }}
        document={docToDetail}
        documentFamily={docToDetail ? docStacks.find(s => s.docNo === getCanonicalDocNo(docToDetail))?.allEditions : null}
        onOpenViewer={(d) => {
          handlePreview(d || docToDetail);
        }}
        onOpenRevise={(d) => {
          setIsDetailOpen(false);
          handleRevise(d || docToDetail);
        }}
        onOpenObsolete={(d) => {
          setIsDetailOpen(false);
          handleObsolete(d || docToDetail);
        }}
      />

      <ExternalDocPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setDocToPreview(null);
        }}
        document={docToPreview}
      />

      {isCopyModalOpen && selectedDocForCopy && (
        <RequestAdditionalCopiesModal
          isOpen={isCopyModalOpen}
          onClose={() => {
            setIsCopyModalOpen(false);
            setSelectedDocForCopy(null);
          }}
          document={selectedDocForCopy}
        />
      )}
    </div>
  );
};

export default ExternalDocsList;
