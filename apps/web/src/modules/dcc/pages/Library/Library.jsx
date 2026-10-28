import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { 
  Search, 
  BookOpen, 
  Share2, 
  Globe, 
  Download, 
  ExternalLink, 
  AlertTriangle, 
  PlusCircle, 
  ShieldAlert, 
  Lock, 
  Building2, 
  MoreHorizontal, 
  GitFork,
  CheckCircle2,
  RotateCcw,
  Edit3,
  Layers,
  ShieldCheck,
  Clock,
  XCircle,
  Eye,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { getRequesterName, getReviewerName, getApproverName, getAckNames, normalizeDeptCode, normalizeDept } from '../../utils/darHelper';
import { hasDocumentAccess } from '../../utils/accessControl';
import { resolveDocCode, evaluateDocumentReviewStatus, addYears, getReviewCycleYears } from '../../utils/documentUtils';
import ReplacementModal from './ReplacementModal';
import RequestAdditionalCopiesModal from '../../components/workflow/RequestAdditionalCopiesModal';
import DocumentDetailModal from '../../components/workflow/DocumentDetailModal';
import toast from 'react-hot-toast';
import { UniversalWatermarkService, WATERMARK_TYPES, resolveWatermarkConfig } from '../../services/UniversalWatermarkService';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import StatusBadge from '../../components/ui/StatusBadge';
import { getDeptBadgeStyle } from '../../../../shared/utils/departmentColors';
import { extractDeptCode } from '../../services/darService';

// Tab Constants
export const TAB_GENERAL = 'GENERAL';
export const TAB_MY_DEPT = 'MY_DEPT';
export const TAB_DISTRIBUTED = 'DISTRIBUTED';
// DCC only: the whole register, every department and every status (ISO 9001 7.5.3).
export const TAB_ALL_DEPTS = 'ALL_DEPTS';

export const filterDocumentsByScope = (documents, selectedScope, currentUser) => {
  const userDept = currentUser?.department || 'DC';
  const affiliatedDepts = currentUser?.affiliatedDepartments || currentUser?.affiliated_departments || [userDept];

  return (documents || []).filter((doc) => {
    const docDept = doc.department || doc.owner_dept || doc.dept_code || (doc.code?.includes('-QC-') ? 'QC' : (doc.docNo?.includes('-QC-') ? 'QC' : ''));
    const isMyDeptDoc = affiliatedDepts.includes(docDept) || (docDept && docDept === userDept);

    switch (selectedScope) {
      case 'MY_DEPT':
        return isMyDeptDoc;
      case 'GENERAL':
      case 'PUBLIC':
        return !isMyDeptDoc && (
          doc.access_level === 'PUBLIC' || 
          doc.is_public === true || 
          doc.access_control?.scope === 'GENERAL' || 
          doc.access_scope === 'GENERAL' || 
          doc.scope === 'GENERAL' || 
          !docDept
        );
      case 'DISTRIBUTED':
        return (doc.distributed_departments || doc.distributed_depts || []).includes(userDept);
      default:
        return true;
    }
  });
};

const Library = () => {
  const navigate = useNavigate();
  const { 
    documents, 
    currentUser, 
    canDownloadDocument, 
    dars, 
    timeline, 
    masterUsers, 
    controlledCopyInstances, 
    documentControlledCopies,
    reportCcDamagedLost, 
    logAction,
    documentTypes,
    masterDepartments,
    departments: storeDepts,
    periodicReviewSchedules,
    simulatedSystemDate,
    getEffectiveToday
  } = useStore();
  
  const isDccUser = Boolean(
    currentUser?.isDcc || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.role === 'DCC_STAFF'
  );

  const [chosenTab, setActiveTab] = useState(isDccUser ? TAB_ALL_DEPTS : TAB_MY_DEPT);
  // Derived, so a non-DCC user can never be left on the DCC tab (e.g. after the signed-in user changes).
  const activeTab = chosenTab === TAB_ALL_DEPTS && !isDccUser ? TAB_MY_DEPT : chosenTab;
  // Only these tabs offer the Active / Superseded / Obsolete sub-tabs; the reader tabs show effective documents only.
  const showsStatusTabs = activeTab === TAB_MY_DEPT || activeTab === 'dept' || activeTab === TAB_ALL_DEPTS;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStandard, setFilterStandard] = useState('');
  const [filterStatus, setFilterStatus] = useState('ACTIVE');
  const [filterDate] = useState('');
  const [filterAccessScope, setFilterAccessScope] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [openMenuDocId, setOpenMenuDocId] = useState(null);
  
  // For Replacement & Ad-Hoc Copy Requests
  const [replacementInstance, setReplacementInstance] = useState(null);
  const [adHocDoc, setAdHocDoc] = useState(null);

  // Deep-linking from notifications or external triggers
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const deepLinkDocId = searchParams.get('docId') || searchParams.get('id') || location.state?.openDocId || location.state?.docId;

  useEffect(() => {
    if (deepLinkDocId && (documents || []).length > 0) {
      const found = documents.find(d => 
        String(d.id) === String(deepLinkDocId) || 
        String(d.document_code || d.doc_code || d.code) === String(deepLinkDocId)
      );
      if (found) {
        setPreviewDoc(found);
      }
    }
  }, [deepLinkDocId, documents]);

  // Close overflow menu on outside click, window resize, or Escape key
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.dropdown-action-dock') && !e.target.closest('.overflow-dropdown-menu')) {
        setOpenMenuDocId(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenMenuDocId(null);
      }
    };
    const handleScrollOrResize = () => {
      if (openMenuDocId) {
        setOpenMenuDocId(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [openMenuDocId]);


  // Department normalization & multi-department resolver
  const deptMatches = (d1, d2) => {
    const s1 = normalizeDept(d1);
    const s2 = normalizeDept(d2);
    if (!s1 || !s2) return false;
    if (s1 === s2) return true;
    return false;
  };

  const primaryDept = useMemo(() => {
    return normalizeDept(
      currentUser?.primary_department || 
      currentUser?.department || 
      currentUser?.dept || 
      currentUser?.dept_code || 
      'PD'
    );
  }, [currentUser]);

  const userDistinctDepts = useMemo(() => {
    if (!currentUser) return [];
    const rawList = [
      currentUser.primary_department,
      currentUser.department,
      currentUser.dept,
      currentUser.dept_code,
      ...(Array.isArray(currentUser.departments) ? currentUser.departments : []),
      ...(Array.isArray(currentUser.secondaryDepartments) ? currentUser.secondaryDepartments : []),
      ...(Array.isArray(currentUser.affiliated_departments) ? currentUser.affiliated_departments : []),
      ...(Array.isArray(currentUser.affiliatedDepartments) ? currentUser.affiliatedDepartments : []),
      ...(Array.isArray(currentUser.depts) ? currentUser.depts : [])
    ];
    const unique = [];
    rawList.forEach(item => {
      const code = normalizeDept(item);
      if (code && !unique.includes(code)) {
        unique.push(code);
      }
    });
    if (primaryDept && unique.includes(primaryDept)) {
      return [primaryDept, ...unique.filter(d => d !== primaryDept)];
    }
    return unique.length > 0 ? unique : [primaryDept];
  }, [currentUser, primaryDept]);



  const availableDepts = useMemo(() => {
    const list = [];
    const seen = new Set();
    const storeDeptList = masterDepartments || storeDepts || [];
    storeDeptList.forEach((dept) => {
      const id = (dept.id || dept.code || dept.dept_code || '').toUpperCase();
      if (id && !seen.has(id)) {
        seen.add(id);
        list.push({
          id,
          name: dept.name || dept.nameTh || dept.nameEn || id
        });
      }
    });
    (documents || []).forEach((doc) => {
      const d = (doc.department || doc.owner_dept || doc.dept_code || '').toUpperCase();
      if (d && !seen.has(d)) {
        seen.add(d);
        list.push({
          id: d,
          name: d
        });
      }
    });
    return list;
  }, [masterDepartments, storeDepts, documents]);

  const userDepts = userDistinctDepts;

  // Helper for QA vs QA/QC match, supporting array of user departments
  const isSameDept = (userDeptsArr, d) => {
    if (!d) return false;
    return (userDeptsArr || []).some(u => deptMatches(u, d));
  };

  const isOwnerDept = useCallback((doc) => {
    const docDept = doc.owner_dept || doc.department || doc.dept_code || doc.dept || extractDeptCode(doc.code || doc.docNo || doc.doc_code || doc.document_code);
    return isSameDept(userDistinctDepts, docDept);
  }, [userDistinctDepts]);

  const hasDistributedCopyToUserDept = useCallback((doc) => {
    // 🛡️ Strict Cross-Department Distribution Rule: Exclude own department documents
    if (isOwnerDept(doc)) return false;
    const docDept = doc.owner_dept || doc.department || doc.dept_code || doc.dept;
    if (currentUser?.department && docDept === currentUser.department) return false;

    // กรองแสดงเอกสาร (จากแผนกอื่น) ที่มีการจัดสรรสำเนาควบคุมมาตั้งไว้ที่แผนกของผู้ใช้งาน
    const hasDistDept = (doc.distributed_depts || []).some(d => isSameDept(userDistinctDepts, d));
    const hasDistObj = (doc.distributions || []).some(d => isSameDept(userDistinctDepts, d.departmentId || d.department || d.dept));
    const hasControlledCopy = (controlledCopyInstances || documentControlledCopies || []).some(c => {
      const matchDoc = String(c.docId || c.doc_id) === String(doc.id) || 
                       c.doc_code === doc.title || 
                       c.docTitle === doc.title ||
                       c.doc_code === doc.document_code;
      return matchDoc && isSameDept(userDistinctDepts, c.holder_dept || c.department) && ['ISSUED_ACTIVE', 'ACTIVE'].includes(c.status);
    });
    return Boolean(hasDistDept || hasDistObj || hasControlledCopy);
  }, [isOwnerDept, userDistinctDepts, currentUser?.department, controlledCopyInstances, documentControlledCopies]);

  // Status Normalization Helper for Universal Tab Filtering
  const matchesStatusTab = (docStatus, selectedTab, doc = null) => {
    const st = (docStatus || (doc && doc.status) || '').toUpperCase();
    // ISO: ห้ามแสดงสถานะปนกัน - ไม่มีแท็บ All Records, ค่าว่างถือเป็น Active
    if (!selectedTab || selectedTab === 'ALL') selectedTab = 'EFFECTIVE';
    
    // 1. แท็บ "มีผลบังคับใช้ (Active)": กรองเฉพาะ: doc.status === 'ACTIVE' && !doc.is_superseded && !doc.is_obsolete
    if (selectedTab === 'EFFECTIVE' || selectedTab === 'ACTIVE') {
      const isSuperseded = st === 'SUPERSEDED' || st === 'SUPERSEDED_ARCHIVED' || st === 'OUTDATED' || Boolean(doc?.is_superseded);
      const isObsolete = st === 'OBSOLETE' || st === 'OBSOLETE_ARCHIVED' || st === 'ARCHIVED_OBSOLETE' || st === 'OBSOLETE_PENDING_RECALL' || st.startsWith('OBSOLETE') || Boolean(doc?.is_obsolete);
      if (isSuperseded || isObsolete) return false;
      return (st === 'EFFECTIVE' || st === 'ACTIVE' || st === 'APPROVED' || st === 'PUBLISHED' || Boolean(doc?.is_active));
    }
    // 2. แท็บ "ฉบับตกรุ่น (Superseded)": กรองเฉพาะ: (doc.status === 'SUPERSEDED' || doc.is_superseded) && !doc.is_obsolete && doc.status !== 'OBSOLETE'
    if (selectedTab === 'SUPERSEDED') {
      const isObsolete = st === 'OBSOLETE' || st === 'OBSOLETE_ARCHIVED' || st === 'ARCHIVED_OBSOLETE' || st === 'OBSOLETE_PENDING_RECALL' || st.startsWith('OBSOLETE') || Boolean(doc?.is_obsolete);
      if (isObsolete) return false;
      const isCurrentEffective = st === 'EFFECTIVE' || st === 'ACTIVE' || st === 'APPROVED' || st === 'PUBLISHED' || Boolean(doc?.is_active);
      if (isCurrentEffective) return false;
      return (st === 'SUPERSEDED' || st === 'SUPERSEDED_ARCHIVED' || st === 'OUTDATED' || Boolean(doc?.is_superseded));
    }
    // 3. แท็บ "ยกเลิกถาวร (Obsolete)": กรองเฉพาะ: doc.status === 'OBSOLETE' || doc.is_obsolete === true
    if (selectedTab === 'OBSOLETE' || selectedTab === 'CANCEL') {
      return (
        st === 'OBSOLETE' ||
        st === 'OBSOLETE_ARCHIVED' ||
        st === 'ARCHIVED_OBSOLETE' ||
        st === 'OBSOLETE_PENDING_RECALL' ||
        st.startsWith('OBSOLETE') ||
        st === 'CANCEL' ||
        Boolean(doc?.is_obsolete)
      );
    }
    return st === selectedTab;
  };

  // ขั้นตอนที่ 1: กรองตาม Scope แท็บหลัก (Data Segregation เด็ดขาด - Mutually Exclusive Logic)
  const baseDocs = useMemo(() => {
    return (documents || []).filter((doc) => {
      const isMyDeptDoc = isOwnerDept(doc);

      if (activeTab === TAB_GENERAL || activeTab === 'general') {
        // แท็บ 1: เอกสารทั่วไป (Strict Separation: ต้องไม่ซ้ำกับเอกสารในแผนกฉัน)
        const docScope = (doc.access_control?.scope || doc.access_scope || doc.scope || 'GENERAL').toUpperCase();
        const isGeneralScope = docScope === 'GENERAL' || docScope === 'PUBLIC' || doc.access_level === 'PUBLIC' || doc.is_public === true || !doc.department;
        return !isMyDeptDoc && isGeneralScope && hasDocumentAccess(doc, currentUser);
      }
      if (activeTab === TAB_MY_DEPT || activeTab === 'dept') {
        // แท็บ 2: เอกสารในแผนกฉัน
        // แสดงเฉพาะเอกสารที่แผนกเจ้าของคือแผนกเดียวกับผู้ใช้งาน
        return isMyDeptDoc;
      }
      if (activeTab === TAB_DISTRIBUTED || activeTab === 'dist') {
        // แท็บ 3: เอกสารที่ได้รับการแจกจ่าย
        // แสดงเฉพาะเอกสารจากแผนกอื่นที่มีการจัดสรรสำเนาควบคุมมาตั้งไว้ที่แผนกของผู้ใช้งาน (ไม่รวมเอกสารที่แผนกตัวเองเป็นเจ้าของเด็ดขาด)
        return !isMyDeptDoc && hasDistributedCopyToUserDept(doc) && hasDocumentAccess(doc, currentUser);
      }
      return true;
    });
  }, [documents, activeTab, isOwnerDept, hasDistributedCopyToUserDept, currentUser]);

  // Compute Counts for All Tabs
  const accessibleDocs = useMemo(() => {
    return (documents || []).filter(d => hasDocumentAccess(d, currentUser));
  }, [documents, currentUser]);

  // Tab 1: เอกสารทั่วไป (Active docs ที่เป็น Scope ทั่วไป และไม่รวมเอกสารของแผนกตนเอง)
  const generalDocsCount = accessibleDocs.filter(d => {
    const isMyDeptDoc = isOwnerDept(d);
    const docScope = (d.access_control?.scope || d.access_scope || d.scope || 'GENERAL').toUpperCase();
    const isGeneralScope = docScope === 'GENERAL' || docScope === 'PUBLIC' || d.access_level === 'PUBLIC' || d.is_public === true || !d.department;
    return !isMyDeptDoc && isGeneralScope && matchesStatusTab(d.status, 'EFFECTIVE', d);
  }).length;

  // Tab 2: เอกสารในแผนกฉัน (Strict Requirement: นับเฉพาะเอกสารที่มีสถานะ ACTIVE เท่านั้น ห้ามนับรวมเอกสารตกรุ่นหรือยกเลิก)
  const myDeptDocsCount = accessibleDocs.filter(d => 
    isOwnerDept(d) && matchesStatusTab(d.status, 'EFFECTIVE', d)
  ).length;

  // Tab 3: เอกสารที่ได้รับการแจกจ่าย (Active docs จากแผนกอื่น ที่แจกจ่ายมายังแผนกผู้ใช้)
  const distributedDocsCount = accessibleDocs.filter(d => 
    !isOwnerDept(d) && hasDistributedCopyToUserDept(d) && matchesStatusTab(d.status, 'EFFECTIVE', d)
  ).length;

  const tabFilteredDocs = baseDocs;

  // ฐานข้อมูลเอกสารก่อนกรองด้วยแท็บสถานะ (แต่อิงตามสิทธิ์การมองเห็นและ Search/Filters หลัก)
  const statusScopeDocs = useMemo(() => {
    const sourceList = (documents || []).filter((doc) => {
      const isMyDeptDoc = isOwnerDept(doc);
      if (activeTab === TAB_MY_DEPT || activeTab === 'dept') {
        return isMyDeptDoc && hasDocumentAccess(doc, currentUser);
      }
      if (activeTab === TAB_GENERAL || activeTab === 'general') {
        const docScope = (doc.access_control?.scope || doc.access_scope || doc.scope || 'GENERAL').toUpperCase();
        const isGeneralScope = docScope === 'GENERAL' || docScope === 'PUBLIC' || doc.access_level === 'PUBLIC' || doc.is_public === true || !doc.department;
        return !isMyDeptDoc && isGeneralScope && hasDocumentAccess(doc, currentUser);
      }
      if (activeTab === TAB_DISTRIBUTED || activeTab === 'dist') {
        return !isMyDeptDoc && hasDistributedCopyToUserDept(doc) && hasDocumentAccess(doc, currentUser);
      }
      return hasDocumentAccess(doc, currentUser);
    });

    return sourceList.filter((doc) => {
      // 1. กรองตามประเภทเอกสาร
      if (filterType && filterType !== 'ALL') {
        const docType = (doc.doc_type || doc.type || (doc.title || '').split('-')[0] || '').toUpperCase();
        if (docType !== filterType.toUpperCase()) return false;
      }

      // 2. กรองตามแผนก (Global Department Dropdown Filter)
      if (filterDept && filterDept !== 'ALL') {
        const docDept = (doc.department || doc.owner_dept || doc.dept_code || doc.dept || '').toUpperCase();
        if (!deptMatches(docDept, filterDept)) return false;
      }

      // 3. กรองตามคำค้นหา
      if (searchTerm && searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        const code = (doc.document_code || doc.doc_code || doc.id || doc.title || '').toLowerCase();
        const title = (doc.title || doc.name || doc.document_title || '').toLowerCase();
        if (!code.includes(q) && !title.includes(q)) return false;
      }

      // 4. กรองตามระดับความลับและวันที่และมาตรฐาน
      if (filterAccessScope && filterAccessScope !== 'ALL') {
        const scope = doc.access_control?.scope || doc.access_scope || 'GENERAL';
        if (scope !== filterAccessScope) return false;
      }
      if (filterStandard && filterStandard !== 'ALL') {
        const stds = doc.relatedStandards || doc.related_standards || [];
        if (!stds.includes(filterStandard)) return false;
      }
      if (filterDate) {
        if (doc.effectiveDate !== filterDate && doc.effective_date !== filterDate) return false;
      }

      return true;
    });
  }, [documents, activeTab, isOwnerDept, hasDistributedCopyToUserDept, currentUser, filterType, filterDept, searchTerm, filterAccessScope, filterStandard, filterDate]);

  // Helper for Resolving Normalized Master Document Code
  const resolveDocCodeKey = useCallback((doc) => {
    if (!doc) return '';
    const resolved = resolveDocCode(doc);
    if (resolved && resolved !== '-' && resolved !== 'DOC-UNKNOWN') {
      return resolved.trim().toUpperCase();
    }
    const fallback = doc.document_code || doc.doc_code || doc.code || doc.docCode || doc.docNo || doc.title || String(doc.id || '');
    return fallback.trim().toUpperCase();
  }, []);

  // Distinct Master Document Counter (1 Document Code = 1 Count regardless of revision count)
  const countDistinctDocuments = useCallback((docs = []) => {
    const uniqueCodes = new Set();
    (docs || []).forEach((doc) => {
      const code = resolveDocCodeKey(doc);
      if (code) {
        uniqueCodes.add(code);
      }
    });
    return uniqueCodes.size;
  }, [resolveDocCodeKey]);

  // Dynamic Count Badges for Status Tabs (Distinct Master Document Counting)
  const tabCounts = useMemo(() => {
    const activeDocs = statusScopeDocs.filter(d => matchesStatusTab(d.status, 'EFFECTIVE', d));
    const supersededDocs = statusScopeDocs.filter(d => matchesStatusTab(d.status, 'SUPERSEDED', d));
    const obsoleteDocs = statusScopeDocs.filter(d => matchesStatusTab(d.status, 'OBSOLETE', d));

    return {
      active: countDistinctDocuments(activeDocs),
      superseded: countDistinctDocuments(supersededDocs),
      obsolete: countDistinctDocuments(obsoleteDocs)
    };
  }, [statusScopeDocs, countDistinctDocuments]);

  const allDeptsDocsCount = countDistinctDocuments(accessibleDocs.filter(d => matchesStatusTab(d.status, 'EFFECTIVE', d)));

  // Compute counts per department for Quick-Pill badges in "เอกสารในแผนกฉัน" (นับเฉพาะ ACTIVE เช่นกัน)
  const _deptCounts = useMemo(() => {
    const counts = {};
    userDistinctDepts.forEach(dept => {
      const docsInDept = accessibleDocs.filter(d => {
        const docDept = d.owner_dept || d.department || d.dept_code || d.dept;
        return isOwnerDept(d) && deptMatches(docDept, dept) && matchesStatusTab(d.status, 'EFFECTIVE', d);
      });
      counts[dept] = countDistinctDocuments(docsInDept);
    });
    return counts;
  }, [accessibleDocs, userDistinctDepts, isOwnerDept, countDistinctDocuments]);

  const filteredDocs = useMemo(() => {
    const rawList = baseDocs.filter((doc) => {
      // 1. กรองตามสถานะ:
      // - ในแท็บ "เอกสารในแผนกฉัน" กรองตาม Sub-tabs (EFFECTIVE, SUPERSEDED, OBSOLETE, ALL)
      // - ในแท็บ "เอกสารทั่วไป" และ "เอกสารที่ได้รับการแจกจ่าย" ห้ามแสดง Sub-tabs และล็อกแสดงเฉพาะเอกสารที่มีผลบังคับใช้ (EFFECTIVE / ACTIVE)
      const effectiveStatusFilter = showsStatusTabs ? filterStatus : 'EFFECTIVE';
      if (!matchesStatusTab(doc.status, effectiveStatusFilter, doc)) return false;

      // 2. กรองตามประเภทเอกสาร
      if (filterType && filterType !== 'ALL') {
        const docType = (doc.doc_type || doc.type || (doc.title || '').split('-')[0] || '').toUpperCase();
        if (docType !== filterType.toUpperCase()) return false;
      }



      // 3. กรองตามแผนก (Global Department Dropdown Filter)
      if (filterDept && filterDept !== 'ALL') {
        const docDept = (doc.department || doc.owner_dept || doc.dept_code || doc.dept || '').toUpperCase();
        if (!deptMatches(docDept, filterDept)) return false;
      }

      // 4. กรองตามคำค้นหา
      if (searchTerm && searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        const code = (doc.document_code || doc.doc_code || doc.id || doc.title || '').toLowerCase();
        const title = (doc.title || doc.name || doc.document_title || '').toLowerCase();
        if (!code.includes(q) && !title.includes(q)) return false;
      }

      // 5. กรองตามระดับความลับและวันที่และมาตรฐาน
      if (filterAccessScope && filterAccessScope !== 'ALL') {
        const scope = doc.access_control?.scope || doc.access_scope || 'GENERAL';
        if (scope !== filterAccessScope) return false;
      }
      if (filterStandard && filterStandard !== 'ALL') {
        const stds = doc.relatedStandards || doc.related_standards || [];
        if (!stds.includes(filterStandard)) return false;
      }
      if (filterDate) {
        if (doc.effectiveDate !== filterDate && doc.effective_date !== filterDate) return false;
      }

      return true;
    });

    // การันตี 100%: ในแท็บ "มีผลบังคับใช้ (Active)" 1 รหัสเอกสาร ต้องปรากฏเพียง 1 แถวเท่านั้น (เลือก Revision ล่าสุด)
    const currentStatusScope = showsStatusTabs ? filterStatus : 'EFFECTIVE';
    if (currentStatusScope === 'EFFECTIVE' || currentStatusScope === 'ACTIVE') {
      const activeByCode = new Map();
      rawList.forEach(doc => {
        const code = resolveDocCodeKey(doc);
        const existing = activeByCode.get(code);
        if (!existing) {
          activeByCode.set(code, doc);
        } else {
          const existingRev = parseInt(existing.rev || existing.revision || '0', 10) || 0;
          const currentRev = parseInt(doc.rev || doc.revision || '0', 10) || 0;
          if (currentRev > existingRev) {
            activeByCode.set(code, doc);
          }
        }
      });
      return Array.from(activeByCode.values());
    }

    // ในแท็บ "ฉบับตกรุ่น (SUPERSEDED)" แสดงเอกสารยกเลิกทุกฉบับ ไม่ Group และเรียงตาม Revision จากมากไปน้อย (เช่น Rev.01, Rev.00)
    if (currentStatusScope === 'SUPERSEDED') {
      return [...rawList].sort((a, b) => {
        const codeA = resolveDocCodeKey(a);
        const codeB = resolveDocCodeKey(b);
        if (codeA !== codeB) {
          return codeA.localeCompare(codeB);
        }
        const revA = parseInt(String(a.rev || a.revision || '0').replace(/\D/g, ''), 10) || 0;
        const revB = parseInt(String(b.rev || b.revision || '0').replace(/\D/g, ''), 10) || 0;
        return revB - revA;
      });
    }

    return rawList;
  }, [baseDocs, filterStatus, filterType, filterDept, activeTab, showsStatusTabs, searchTerm, filterAccessScope, filterStandard, filterDate, resolveDocCodeKey]);

  // Grouped Stacking for Superseded and Obsolete tabs (1 Document Code = 1 Row)
  const isGroupedView = filterStatus === 'SUPERSEDED' || filterStatus === 'OBSOLETE';

  const groupedDocs = useMemo(() => {
    if (!isGroupedView) return [];

    const map = new Map();
    filteredDocs.forEach(doc => {
      const code = resolveDocCodeKey(doc);
      if (!map.has(code)) {
        map.set(code, {
          code,
          docs: []
        });
      }
      map.get(code).docs.push(doc);
    });

    const allCopiesList = controlledCopyInstances || documentControlledCopies || [];

    const groups = [];
    map.forEach(({ code, docs }) => {
      // In SUPERSEDED view, strictly exclude any revision that is EFFECTIVE / ACTIVE / current
      const safeDocs = filterStatus === 'SUPERSEDED'
        ? docs.filter(d => {
            const st = (d.status || '').toUpperCase();
            const isEff = st === 'EFFECTIVE' || st === 'ACTIVE' || st === 'APPROVED' || st === 'PUBLISHED' || Boolean(d.is_active);
            return !isEff && (st === 'SUPERSEDED' || st === 'SUPERSEDED_ARCHIVED' || st === 'OUTDATED' || Boolean(d.is_superseded));
          })
        : docs;

      if (safeDocs.length === 0) return;

      // Sort docs by revision descending (e.g. Rev.02, Rev.01, Rev.00)
      safeDocs.sort((a, b) => {
        const revA = parseInt(String(a.rev || a.revision || '0').replace(/\D/g, ''), 10) || 0;
        const revB = parseInt(String(b.rev || b.revision || '0').replace(/\D/g, ''), 10) || 0;
        return revB - revA;
      });

      const latestDoc = safeDocs[0];
      const revNums = safeDocs.map(d => parseInt(String(d.rev || d.revision || '0').replace(/\D/g, ''), 10) || 0).sort((a, b) => a - b);
      const minRevStr = String(revNums[0] ?? 0).padStart(2, '0');
      const maxRevStr = String(revNums[revNums.length - 1] ?? 0).padStart(2, '0');
      const revRange = safeDocs.length > 1 ? `R${minRevStr} - R${maxRevStr}` : `R${minRevStr}`;

      // Build revisions with individual recall metrics
      const revisions = safeDocs.map(d => {
        const revStr = String(d.rev || d.revision || '00').padStart(2, '0');
        const revNum = parseInt(revStr, 10);
        const relCopies = allCopiesList.filter(copy => {
          const matchDoc = String(copy.docId || copy.doc_id) === String(d.id) ||
                           copy.doc_code === code ||
                           copy.docTitle === d.title;
          const cRev = parseInt(String(copy.rev || copy.doc_version || copy.revision || '0').replace(/\D/g, ''), 10);
          return matchDoc && cRev === revNum;
        });

        const pendingCopies = relCopies.filter(c => 
          ['SUPERSEDED_PENDING_RECALL', 'PENDING_RECALL', 'DAMAGED_PENDING_RECALL', 'OBSOLETE_PENDING_RECALL', 'RECALLED'].includes(c.status)
        );
        const completedCopies = relCopies.filter(c => 
          ['DESTROYED', 'RECALLED_DESTROYED', 'ARCHIVED_OBSOLETE', 'RECALLED_OBSOLETE', 'DISPOSED'].includes(c.status)
        );

        const totalCount = relCopies.length;
        const pendingCount = pendingCopies.length;
        const recalledCount = completedCopies.length;
        const recallStatus = totalCount === 0 ? 'COMPLETED' : (pendingCount > 0 ? 'PENDING' : 'COMPLETED');

        return {
          ...d,
          revision: revStr,
          effectiveDate: d.effectiveDate || d.effective_date || '-',
          recallStatus,
          recalledCount,
          pendingCopiesCount: pendingCount,
          totalCount
        };
      });

      const pendingRecalls = revisions.filter(r => r.recallStatus === 'PENDING' || r.pendingCopiesCount > 0);

      groups.push({
        id: `grp-${code}`,
        code,
        displayCode: latestDoc.document_code || latestDoc.doc_code || latestDoc.code || latestDoc.title || code,
        title: latestDoc.name || latestDoc.docName || latestDoc.title || 'Document',
        department: latestDoc.department || latestDoc.owner_dept || 'PD',
        docType: latestDoc.docType || (code ? code.split('-')[0] : 'SOP'),
        revisions,
        latestSupersededRev: revisions[0]?.revision || '00',
        totalRevisions: revisions.length,
        hasPendingRecall: pendingRecalls.length > 0,
        pendingRecalls,
        latestDoc: {
          ...latestDoc,
          revisions,
          code,
          document_code: code
        },
        docs: revisions,
        revRange
      });
    });

    return groups;
  }, [filteredDocs, isGroupedView, resolveDocCodeKey, controlledCopyInstances, documentControlledCopies, filterStatus]);

  const currentStatusTabTotal = useMemo(() => {
    if (filterStatus === 'SUPERSEDED') return tabCounts.superseded;
    if (filterStatus === 'OBSOLETE') return tabCounts.obsolete;
    return tabCounts.active;
  }, [filterStatus, tabCounts]);

  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const toggleGroupExpand = (groupCode) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      const code = String(groupCode || '').trim().toUpperCase();
      if (next.has(code) || next.has(groupCode)) {
        next.delete(code);
        next.delete(groupCode);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [filterStatus, activeTab]);

  const tableData = isGroupedView ? groupedDocs : filteredDocs;

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedData,
    totalItems
  } = useTablePagination(tableData, 10);

  const availableTypes = [...new Set([
    ...accessibleDocs.map(doc => (doc.title || '').split('-')[0]),
    ...(documentTypes || []).filter(t => t.status === 'ACTIVE' || t.status === 'Active' || t.isActive !== false).map(t => t.code || t.id)
  ])].filter(Boolean).sort();

  const availableStandards = [...new Set(accessibleDocs.flatMap(doc => doc.relatedStandards || doc.related_standards || []))].filter(Boolean).sort();

  const handleExport = () => {
    const docsToExport = filteredDocs;
    if (!docsToExport || docsToExport.length === 0) {
      toast.error('ไม่มีข้อมูลเอกสารสำหรับส่งออก');
      return;
    }

    const formatDt = (dateInput) => {
      if (!dateInput || dateInput === '-') return '-';
      try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) {
          const match = String(dateInput).match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (match) return `${match[3]}/${match[2]}/${match[1]} 09:00`;
          return String(dateInput);
        }
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${mins}`;
      } catch {
        return String(dateInput);
      }
    };

    const headers = [
      'ลำดับ (No.)',
      'รหัสเอกสาร (Doc Code)',
      'ชื่อเอกสาร (Document Title)',
      'ประเภทเอกสาร (Type)',
      'แผนกเจ้าของ (Owner Dept)',
      'ฉบับที่ (Rev.)',
      'วันที่มีผลบังคับใช้ (Effective Date)',
      'สถานะ (Status)',
      'ระดับความลับ (Access Scope)',
      'เลขที่คำร้อง (DAR Reference)',
      'ประเภทคำร้อง (DAR Type)',
      'ผู้ร้องขอ (Requester Name)',
      'วันเวลาที่ร้องขอ (Requester Timestamp)',
      'ผู้ทบทวน (Reviewer Name)',
      'วันเวลาที่ทบทวน (Reviewer Timestamp)',
      'ผู้อนุมัติ (Approver Name)',
      'วันเวลาที่อนุมัติ (Approver Timestamp)',
      'ผู้รับทราบ (Acknowledger Names)',
      'วันเวลาที่รับทราบ (Acknowledger Timestamp)',
      'จำนวนจุดแจกจ่ายสำเนา (Copies Count)',
      'รายการจุดแจกจ่ายสำเนา (Distribution Points)',
      'เหตุผลในการร้องขอ/แก้ไข (DAR Reason)',
      'รายละเอียดการเปลี่ยนแปลง (DAR Change Details)'
    ];

    const rows = docsToExport.map((doc, index) => {
      const docCode = (doc.document_code || doc.doc_code || doc.code || doc.docCode || doc.title || String(doc.id)).trim();
      const docTitle = doc.name || doc.docName || doc.title || 'Document';
      const docType = doc.docType || doc.doc_type || (docCode ? docCode.split('-')[0] : 'SOP');
      const dept = normalizeDeptCode(doc.department || doc.dept || doc.owner_dept) || '-';
      const rev = String(doc.rev || doc.revision || '00').padStart(2, '0');
      const effDate = doc.effectiveDate || doc.effective_date || '-';
      const status = doc.status || 'EFFECTIVE';
      const scope = doc.access_control?.scope || doc.access_scope || 'GENERAL';

      // Find matching DAR & workflow
      const workflow = resolveDocWorkflow(doc);
      const dar = workflow.dar || (dars || []).find(d => 
        String(d.id) === String(doc.darId) ||
        (d.doc_code && d.doc_code === docCode) ||
        (d.docId && String(d.docId) === String(doc.id))
      );

      // Extract workflow timestamps from timeline
      const darId = dar?.id;
      const darTimeline = darId ? (timeline || []).filter(t => t.darId === darId) : [];

      const reqTl = darTimeline.find(t => t.action === 'Created' || t.action === 'SUBMIT' || t.action === 'Resubmitted');
      const reqName = workflow.req !== '-' ? workflow.req : (dar ? getRequesterName(dar, masterUsers) : '-');
      const reqTime = formatDt(reqTl?.date || reqTl?.timestamp || dar?.createdAt || dar?.requestDate || dar?.request_date);

      const revTl = darTimeline.slice().reverse().find(t => t.action === 'Reviewed' || t.action === 'REVIEW');
      const revName = workflow.rev !== '-' ? workflow.rev : (dar ? getReviewerName(dar, timeline) : '-');
      const revTime = formatDt(revTl?.date || revTl?.timestamp || dar?.reviewedAt || dar?.reviewDate);

      const appTl = darTimeline.slice().reverse().find(t => t.action === 'Approved' || t.action === 'APPROVE');
      const appName = workflow.app !== '-' ? workflow.app : (dar ? getApproverName(dar, timeline) : '-');
      const appTime = formatDt(appTl?.date || appTl?.timestamp || dar?.approvedAt || dar?.approveDate);

      const ackTls = darTimeline.filter(t => t.action === 'Acknowledged' || t.action === 'ACKNOWLEDGE' || t.action === 'Ack');
      const ackNames = dar ? getAckNames(dar, timeline) : '-';
      const ackTime = ackTls.length > 0 ? formatDt(ackTls[ackTls.length - 1]?.date || ackTls[ackTls.length - 1]?.timestamp) : '-';

      // Physical controlled copies and distribution points
      const docDistList = (doc.distributions || []);
      const physicalCopies = (controlledCopyInstances || documentControlledCopies || []).filter(c => 
        (String(c.docId || c.doc_id) === String(doc.id) || c.doc_code === docCode || c.docTitle === doc.title) &&
        ['ISSUED_ACTIVE', 'ACTIVE'].includes(c.status)
      );
      const totalCopiesCount = Math.max(docDistList.length, physicalCopies.length);
      const distDetails = physicalCopies.length > 0 
        ? physicalCopies.map(c => `[Copy ${c.copy_no || c.ccNumber || '01'}] ${c.holder_dept || c.department} - ${c.location || c.locationName || c.station_name || 'Station'}`).join('; ')
        : (docDistList.map(d => `${d.departmentId || d.department} (${d.location || 'Station'})`).join('; ') || '-');

      const darReason = dar ? (dar.requestReason || dar.changeReason || dar.reason || '-') : '-';
      const darDetail = dar ? (dar.changeSummary || dar.description || dar.changeDetails || dar.requestDetail || '-') : '-';
      const darNo = dar ? (dar.dar_no || dar.id || '-') : '-';
      const darType = dar ? (dar.type || dar.request_type || '-') : '-';

      const escapeCell = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

      return [
        index + 1,
        escapeCell(docCode),
        escapeCell(docTitle),
        escapeCell(docType),
        escapeCell(dept),
        escapeCell(rev),
        escapeCell(effDate),
        escapeCell(status),
        escapeCell(scope),
        escapeCell(darNo),
        escapeCell(darType),
        escapeCell(reqName),
        escapeCell(reqTime),
        escapeCell(revName),
        escapeCell(revTime),
        escapeCell(appName),
        escapeCell(appTime),
        escapeCell(ackNames),
        escapeCell(ackTime),
        totalCopiesCount,
        escapeCell(distDetails),
        escapeCell(darReason),
        escapeCell(darDetail)
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `QMS_Deep_Export_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('ส่งออกข้อมูลเอกสารเชิงลึก (Deep Export CSV) เรียบร้อยแล้ว');
  };

  const handleDownloadUncontrolled = async (doc, e, openInTab = false) => {
    if (e) e.stopPropagation();
    if (!canDownloadDocument(doc, currentUser)) {
      toast.error('คุณไม่มีสิทธิ์ดาวน์โหลดเอกสารนี้ตามระดับการเข้าถึง (Access Scope)');
      return;
    }
    const docCode = doc.document_code || doc.doc_code || doc.code || doc.docCode || doc.title || 'Document';
    const isForm = UniversalWatermarkService.isBlankFormBypass(doc);

    if (isForm) {
      // ยกเว้นประเภทเอกสาร FM (แบบฟอร์ม): ห้ามประทับลายน้ำใดๆ เพื่อให้ผู้ใช้นำไปปรินต์ใช้งานได้
      const toastId = toast.loading(openInTab ? 'กำลังเตรียมเปิดแบบฟอร์ม...' : 'กำลังดาวน์โหลดแบบฟอร์ม (ไม่มีลายน้ำ)...');
      try {
        if (doc.file_url || doc.fileUrl) {
          const fileUrl = doc.file_url || doc.fileUrl;
          const link = document.createElement('a');
          link.href = fileUrl;
          link.target = openInTab ? '_blank' : '_self';
          link.download = `${docCode}_BLANK_FORM.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          await UniversalWatermarkService.downloadCleanPdf(
            doc,
            {
              userName: currentUser?.name || 'User',
              userDept: currentUser?.department || currentUser?.dept || 'User Station',
              reason: 'Blank Form Template / Direct Use',
              location: currentUser?.department || currentUser?.dept || 'User Station',
              docCode
            },
            openInTab
          );
        }

        toast.dismiss(toastId);
        toast.success(openInTab ? `เปิดแบบฟอร์ม ${docCode} เรียบร้อยแล้ว` : `ดาวน์โหลดแบบฟอร์ม ${docCode} (ไม่มีลายน้ำ) สำเร็จ`);

        if (logAction) {
          logAction({
            action: 'DOWNLOAD_BLANK_FORM_PDF',
            docId: doc.id,
            docTitle: doc.title,
            watermarkType: 'NONE_BLANK_FORM',
            user: currentUser?.name,
            dept: currentUser?.department
          });
        }
      } catch (error) {
        console.error('Download form error:', error);
        toast.dismiss(toastId);
        toast.error('เกิดข้อผิดพลาดในการดาวน์โหลดแบบฟอร์ม');
      }
      return;
    }

    // เอกสารทั่วไป (เช่น WI, SOP, MN): ส่ง Payload/Flag ระบุว่าเป็นการโหลดแบบ UNCONTROLLED COPY
    const toastId = toast.loading(openInTab ? 'กำลังสร้างไฟล์ PDF และเตรียมเปิดพรีวิว...' : 'กำลังสร้างไฟล์ PDF และประทับลายน้ำ (UNCONTROLLED COPY)...');
    try {
      const watermarkConfig = resolveWatermarkConfig(doc, { currentUser });
      const watermarkType = WATERMARK_TYPES.UNCONTROLLED_COPY;
      
      await UniversalWatermarkService.downloadWatermarkedPdf(
        doc,
        watermarkType,
        {
          userName: currentUser?.name,
          userDept: currentUser?.department || currentUser?.dept || 'User Station',
          reason: 'General Download / Print',
          location: currentUser?.department || currentUser?.dept || 'User Station',
          ...watermarkConfig.metadata,
          watermarkType: 'UNCONTROLLED_COPY',
          downloadMode: 'UNCONTROLLED_COPY',
          isUncontrolledCopy: true,
          isRestricted: doc.access_control?.scope === 'RESTRICTED' || doc.accessScope === 'Restricted' || doc.accessScope === 'RESTRICTED'
        },
        openInTab
      );

      toast.dismiss(toastId);
      if (openInTab) {
        toast.success(`เปิดเอกสาร ${doc.title || docCode} ในแท็บใหม่เรียบร้อยแล้ว`);
      } else {
        toast.success(`ดาวน์โหลดเอกสาร ${doc.title || docCode} (UNCONTROLLED COPY) สำเร็จ`);
      }

      if (logAction) {
        logAction({
          action: 'DOWNLOAD_WATERMARK_PDF',
          docId: doc.id,
          docTitle: doc.title,
          watermarkType: 'UNCONTROLLED_COPY',
          downloadMode: 'UNCONTROLLED_COPY',
          user: currentUser?.name,
          dept: currentUser?.department
        });
      }
    } catch (error) {
      console.error('PDF Generation Error:', error);
      toast.dismiss(toastId);
      toast.error('เกิดข้อผิดพลาดในการสร้าง PDF');
    }
  };

  const handleDownloadCleanMaster = async (doc, e) => {
    e.stopPropagation();
    if (!isDccUser) {
      toast.error('สงวนสิทธิ์เฉพาะ DCC Admin เท่านั้น');
      return;
    }
    const docTitle = doc.title || doc.document_title || doc.document_code || doc.doc_code || 'Document';
    const toastId = toast.loading('กำลังจัดเตรียมไฟล์ต้นฉบับ (ไม่ติดลายน้ำ)...');
    try {
      if (doc.file_url || doc.fileUrl) {
        const fileUrl = doc.file_url || doc.fileUrl;
        const link = document.createElement('a');
        link.href = fileUrl;
        link.target = '_blank';
        link.download = `${doc.document_code || doc.doc_code || docTitle}_CLEAN_MASTER.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        await UniversalWatermarkService.downloadCleanPdf(
          doc,
          {
            userName: currentUser?.name || 'DCC Admin',
            userDept: currentUser?.department || 'DC',
            reason: 'Clean Master Custodian Export (ISO 9001)',
            location: 'DCC Central Archive'
          },
          false
        );
      }

      toast.dismiss(toastId);
      toast.success(`ดาวน์โหลดต้นฉบับ (ไม่ติดลายน้ำ) ${docTitle} สำเร็จ`);

      if (logAction) {
        logAction({
          action: 'DOWNLOAD_CLEAN_MASTER_PDF',
          docId: doc.id,
          docTitle,
          user: currentUser?.name,
          dept: currentUser?.department
        });
      }
    } catch (error) {
      console.error('Clean Master Download Error:', error);
      toast.dismiss(toastId);
      toast.error('เกิดข้อผิดพลาดในการดาวน์โหลดต้นฉบับ');
    }
  };

  const handleDownloadMaster = async (doc, e) => {
    e.stopPropagation();
    const toastId = toast.loading('กำลังสร้าง Master Archive PDF...');
    try {
      const watermarkType = WATERMARK_TYPES.OFFICIAL_MASTER_COPY;

      await UniversalWatermarkService.downloadWatermarkedPdf(
        doc,
        watermarkType,
        {
          userName: currentUser?.name || 'DCC Officer',
          userDept: currentUser?.department || 'DCC Central',
          reason: 'Official Master Archive',
          location: 'DCC Central Archive'
        },
        false
      );

      toast.dismiss(toastId);
      toast.success(`ดาวน์โหลด Master Copy ${doc.title} สำเร็จ`);

      if (logAction) {
        logAction({
          action: 'DOWNLOAD_MASTER_PDF',
          docId: doc.id,
          docTitle: doc.title,
          watermarkType,
          user: currentUser?.name,
          dept: currentUser?.department
        });
      }
    } catch (error) {
      console.error('PDF Generation Error:', error);
      toast.dismiss(toastId);
      toast.error('เกิดข้อผิดพลาดในการสร้าง Master PDF');
    }
  };

  const handleDownloadExternal = async (doc, e) => {
    e.stopPropagation();
    const toastId = toast.loading('กำลังสร้าง External Release PDF...');
    try {
      const watermarkType = WATERMARK_TYPES.STRICTLY_CONFIDENTIAL;

      await UniversalWatermarkService.downloadWatermarkedPdf(
        doc,
        watermarkType,
        {
          userName: currentUser?.name || 'DCC Officer',
          userDept: currentUser?.department || 'DCC Central',
          reason: 'External Audit / Vendor Release',
          location: 'External Entity'
        },
        false
      );

      toast.dismiss(toastId);
      toast.success(`ดาวน์โหลด External Release ${doc.title} สำเร็จ`);

      if (logAction) {
        logAction({
          action: 'DOWNLOAD_EXTERNAL_PDF',
          docId: doc.id,
          docTitle: doc.title,
          watermarkType,
          user: currentUser?.name,
          dept: currentUser?.department
        });
      }
    } catch (error) {
      console.error('PDF Generation Error:', error);
      toast.dismiss(toastId);
      toast.error('เกิดข้อผิดพลาดในการสร้าง External PDF');
    }
  };



  const handleRequestAdditionalCopy = (doc) => {
    navigate('/controlled-copies/request', {
      state: {
        targetDocCode: doc.document_code || doc.doc_code,
        targetDocTitle: doc.title || doc.document_title,
        currentRevision: doc.revision || '00',
      },
    });
  };

  const handleInitiateRevision = (doc) => {
    navigate('/dar/new', {
      state: {
        darType: 'REVISION',
        selectedDocId: doc.id,
        targetDocCode: doc.document_code || doc.doc_code,
        targetDocTitle: doc.title || doc.document_title,
        currentRevision: doc.revision || '00',
      },
    });
  };

  const handleInitiateObsolete = (doc) => {
    navigate('/dar/obsolete', {
      state: {
        selectedDocId: doc.id,
        targetDocCode: doc.document_code || doc.doc_code,
        targetDocTitle: doc.title || doc.document_title,
        currentRevision: doc.revision || '00',
      },
    });
  };

  const handleSelectTab = (tab) => {
    setActiveTab(tab);
    if (tab !== TAB_MY_DEPT && tab !== 'dept' && tab !== TAB_ALL_DEPTS) {
      setFilterStatus('EFFECTIVE');
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterType('ALL');
    setFilterDept('ALL');
    setFilterStandard('ALL');
    setFilterAccessScope('ALL');
    setFilterStatus('EFFECTIVE');
  };





  const renderSecurityBadge = (doc) => {
    const scope = doc?.access_control?.scope || doc?.access_scope || 'GENERAL';
    if (scope === 'GENERAL') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
          <Globe size={11} className="text-slate-400" /> ทั่วไป
        </span>
      );
    }
    if (scope === 'DEPT_ONLY') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
          <Lock size={11} className="text-amber-500" /> เฉพาะแผนก
        </span>
      );
    }
    if (scope === 'TARGETED') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-blue-700 font-medium">
          <Building2 size={11} className="text-blue-500" /> ระบุแผนก
        </span>
      );
    }
    if (scope === 'RESTRICTED') {
      const minLvl = doc?.access_control?.min_access_level;
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium">
          <ShieldAlert size={11} className="text-rose-500" /> ลับเฉพาะ{minLvl ? ` (Lv.${minLvl}+)` : ''}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
        <Globe size={11} className="text-slate-400" /> ทั่วไป
      </span>
    );
  };
  const resolveDocWorkflow = (doc) => {
    if (!doc) return { req: '-', rev: '-', app: '-', dar: null };

    const docCode = (doc.document_code || doc.doc_code || doc.code || doc.docCode || doc.title || String(doc.id)).trim().toUpperCase();

    // 1. Find associated DAR by darId or document code/id
    let dar = (dars || []).find(d => d.id === doc.darId);
    if (!dar) {
      const matchingDars = (dars || []).filter(d => {
        const darCode = (d.doc_code || d.docCode || d.title || d.docIdInput || d.targetDocCode || '').trim().toUpperCase();
        const darDocId = String(d.docId || d.doc_id || d.docIdRef || '');
        return (darCode && darCode === docCode) || (darDocId && darDocId === String(doc.id));
      });
      dar = matchingDars.find(d => d.status === 'COMPLETED') ||
            matchingDars.find(d => d.status === 'APPROVED' || d.status === 'EFFECTIVE') ||
            matchingDars[0];
    }

    // 2. Requester Resolution
    let req = doc.requesterName || doc.createdByName || doc.ownerName;
    if (!req && dar) {
      req = dar.requesterName || dar.requester_name || getRequesterName(dar, masterUsers);
    }
    if (!req || req === '-') req = '-';

    // 3. Reviewer Resolution
    let rev = doc.reviewerName;
    if (!rev && dar) {
      rev = dar.reviewerName || dar.reviewer_name || getReviewerName(dar, timeline);
    }
    if (!rev) rev = '-';

    // 4. Approver Resolution (Requirement: from finished DAR if available, never '-')
    let app = doc.approverName || doc.approvedBy || doc.approver;
    if (!app && dar) {
      app = dar.approverName || dar.approver_name || dar.approvedBy || dar.approver || getApproverName(dar, timeline);
    }
    if (!app || app === '-') {
      const completedDar = (dars || []).find(d => {
        const darCode = (d.doc_code || d.docCode || d.title || d.docIdInput || d.targetDocCode || '').trim().toUpperCase();
        const darDocId = String(d.docId || d.doc_id || d.docIdRef || '');
        return (d.status === 'COMPLETED' || d.status === 'APPROVED') && 
               ((darCode && darCode === docCode) || (darDocId && darDocId === String(doc.id)));
      });
      if (completedDar) {
        app = completedDar.approverName || completedDar.approver_name || completedDar.approvedBy || completedDar.approver || getApproverName(completedDar, timeline);
      }
    }
    if (!app) app = '-';

    return { req, rev, app, dar };
  };

  const getDistributionSummary = (doc) => {
    const distList = doc?.distributions || [];
    const rawDepts = distList.map(d => d.departmentId || d.department || d.holder_dept || d.dept).filter(Boolean);
    const normalizedDepts = rawDepts.map(normalizeDeptCode).filter(Boolean);
    const uniqueDepts = Array.from(new Set(normalizedDepts));
    const count = distList.length;
    const deptStr = uniqueDepts.join(', ') || '-';
    const tooltip = uniqueDepts.length > 0 
      ? `จุดแจกจ่าย: ${count} สำเนา (${deptStr})`
      : 'ไม่มีสำเนาแจกจ่ายภายนอก';

    return { count, uniqueDepts, deptStr, tooltip };
  };

  const renderLifecycleBadge = (primaryDoc, revisionsList, isObsoleteTab, isSupersededTab) => {
    const docCode = (primaryDoc.document_code || primaryDoc.doc_code || primaryDoc.code || primaryDoc.docCode || primaryDoc.title || String(primaryDoc.id)).trim().toUpperCase();

    // Check if any revision of this document is currently active/effective in the system
    // SKIP this check if we are explicitly inside the SUPERSEDED or OBSOLETE tab context
    const activeRev = (!isObsoleteTab && !isSupersededTab) ? (documents || []).find(d => {
      const c = (d.document_code || d.doc_code || d.code || d.docCode || d.title || String(d.id)).trim().toUpperCase();
      return c === docCode && (d.status === 'EFFECTIVE' || d.status === 'ACTIVE');
    }) : null;

    const isPrimaryActive = primaryDoc.status === 'EFFECTIVE' || primaryDoc.status === 'ACTIVE';
    const hasActiveVersion = Boolean(isPrimaryActive || activeRev);

    const isObsolete = (primaryDoc.status === 'OBSOLETE' || primaryDoc.is_obsolete || isObsoleteTab) && !hasActiveVersion;
    const isSuperseded = (primaryDoc.status === 'SUPERSEDED' || primaryDoc.status === 'SUPERSEDED_ARCHIVED' || primaryDoc.is_superseded || isSupersededTab) && !hasActiveVersion;

    if (hasActiveVersion) {
      return (
        <StatusBadge status="EFFECTIVE" customLabel="มีผลบังคับใช้ (Active)" icon={<CheckCircle2 size={13} strokeWidth={1.5} />} />
      );
    }

    if (isObsolete) {
      return (
        <StatusBadge status="OBSOLETE" customLabel="ยกเลิกถาวร" icon={<XCircle size={13} strokeWidth={1.5} />} />
      );
    }

    if (isSuperseded) {
      return (
        <StatusBadge status="SUPERSEDED" customLabel="ฉบับตกรุ่น" icon={<Clock size={13} strokeWidth={1.5} />} />
      );
    }

    return (
      <StatusBadge status={primaryDoc.status || 'EFFECTIVE'} />
    );
  };

  const renderFlatTable = () => (
    <div className="w-full max-w-full flex-1 flex flex-col min-h-0 card-surface overflow-hidden h-auto">
      <div className="w-full flex-1 overflow-y-auto overflow-x-auto min-h-0 scrollbar-thin">
        <table className="w-full text-left text-sm table-auto min-w-full border-collapse">
          <thead className="bg-slate-50 text-slate-700 font-semibold text-xs uppercase tracking-wider border-b border-slate-200 sticky top-0 z-20 whitespace-nowrap backdrop-blur-xs">
            <tr>
              <th className={`${filterStatus === 'OBSOLETE' ? 'w-[35%]' : filterStatus === 'SUPERSEDED' ? 'w-[28%]' : 'w-[30%]'} min-w-[220px] py-2.5 px-3.5 select-none bg-slate-50`}>รหัสและชื่อเอกสาร</th>
              <th className={`${filterStatus === 'SUPERSEDED' ? 'w-[14%]' : 'w-[15%]'} min-w-[120px] py-2.5 px-3 select-none bg-slate-50`}>
                {filterStatus === 'SUPERSEDED' ? 'แผนกเจ้าของ' : 'แผนกและสิทธิ์'}
              </th>
              <th className={`${filterStatus === 'SUPERSEDED' ? 'w-[16%]' : 'w-[15%]'} min-w-[130px] py-2.5 px-3 select-none bg-slate-50`}>
                {filterStatus === 'SUPERSEDED' ? 'ฉบับและวันบังคับใช้เดิม' : 'ฉบับและวันบังคับใช้'}
              </th>
              <th className={`${filterStatus === 'SUPERSEDED' ? 'w-[20%]' : 'w-[20%]'} min-w-[160px] py-2.5 px-3 select-none bg-slate-50`}>
                {filterStatus === 'SUPERSEDED' ? 'การเรียกคืนสำเนา' : 'สายอนุมัติและสำเนา'}
              </th>
              <th className={`${filterStatus === 'OBSOLETE' ? 'w-[15%]' : 'w-[13%]'} min-w-[130px] py-2.5 px-3 select-none bg-slate-50`}>สถานะเอกสาร</th>
              {filterStatus !== 'OBSOLETE' && (
                <th className="w-[84px] min-w-[84px] py-2.5 px-3 text-right select-none bg-slate-50">การจัดการ</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.map((item, idx) => {
              const isGroup = Boolean(item.docs && item.latestDoc);
              const primaryDoc = isGroup ? item.latestDoc : item;
              const docCode = (primaryDoc.document_code || primaryDoc.doc_code || primaryDoc.code || primaryDoc.docCode || primaryDoc.title || String(primaryDoc.id)).trim();
              const docCodeUpper = docCode.toUpperCase();
              const docType = primaryDoc.docType || primaryDoc.doc_type || (docCode ? docCode.split('-')[0] : 'SOP');
              const docTitleName = primaryDoc.name || primaryDoc.docName || primaryDoc.title || 'Document';
              const canonicalDept = normalizeDeptCode(primaryDoc.department || primaryDoc.dept || primaryDoc.owner_dept) || '-';
              const revFormatted = String(primaryDoc.rev || primaryDoc.revision || '00').padStart(2, '0');
              const effDateDisplay = primaryDoc.effectiveDate || primaryDoc.effective_date || '-';

              // Revision list for expand panel
              const revisionsList = isGroup && item.docs ? item.docs : (documents || []).filter(d => {
                const c = (d.document_code || d.doc_code || d.code || d.docCode || d.title || String(d.id)).trim().toUpperCase();
                return c === docCodeUpper;
              }).sort((a, b) => {
                const revA = parseInt(a.rev || a.revision || '0', 10) || 0;
                const revB = parseInt(b.rev || b.revision || '0', 10) || 0;
                return revB - revA;
              });

              const activeRevisionsList = revisionsList.length > 0 ? revisionsList : [primaryDoc];
              const isExpanded = expandedGroups.has(docCodeUpper) || expandedGroups.has(docCode);
              const isObsoleteTab = filterStatus === 'OBSOLETE';
              const isSupersededTab = filterStatus === 'SUPERSEDED';

              // Workflow and Distribution
              const workflow = resolveDocWorkflow(primaryDoc);
              const distSummary = getDistributionSummary(primaryDoc);

              // Permissions & Action Dock
              const isOwner = isDccUser || isOwnerDept(primaryDoc);
              const isEffective = primaryDoc.status === 'EFFECTIVE' || primaryDoc.status === 'ACTIVE';
              const myDeptActiveCopies = (controlledCopyInstances || documentControlledCopies || []).filter(copy => 
                (String(copy.docId || copy.doc_id) === String(primaryDoc.id) || copy.doc_code === docCode || copy.docTitle === primaryDoc.title) &&
                isSameDept(userDepts, copy.holder_dept || copy.department) &&
                ['ISSUED_ACTIVE', 'ACTIVE'].includes(copy.status)
              );
              const hasActiveCopiesToReport = isDccUser || myDeptActiveCopies.length > 0;
              const isMenuOpen = openMenuDocId === primaryDoc.id;
              const isFormDoc = Boolean(
                docType === 'FM' ||
                primaryDoc.type === 'FM' ||
                primaryDoc.docType === 'FM' ||
                docCodeUpper.startsWith('FM') ||
                (primaryDoc.title && String(primaryDoc.title).trim().toUpperCase().startsWith('FM'))
              );

              return (
                <React.Fragment key={primaryDoc.id || `${docCode}-${idx}`}>
                  <tr 
                    className={`hover:bg-slate-50/80 border-b border-slate-100 transition-colors duration-150 cursor-pointer group ${
                      isExpanded ? 'bg-blue-50/30 border-l-4 border-l-blue-600' : ''
                    } ${isMenuOpen ? 'relative z-10 bg-slate-50' : ''}`}
                    onClick={() => setPreviewDoc(primaryDoc)}
                  >
                    {/* 1. รหัสและชื่อเอกสาร (Document Identity - First Column) */}
                    <td className="py-2.5 px-3.5 align-middle">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight">
                            {docCode}
                          </span>
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold border border-slate-200">
                            {docType}
                          </span>
                          {isGroupedView && (item.revisions || item.docs || []).length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroupExpand(docCode);
                              }}
                              className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
                              title={isExpanded ? "ย่อรายการฉบับเก่า" : "ขยายดูประวัติทุกฉบับ"}
                            >
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                          )}
                        </div>
                        <div 
                          className="font-medium text-slate-700 text-xs sm:text-sm leading-relaxed truncate max-w-md group-hover:text-blue-900 transition-colors" 
                          title={docTitleName}
                        >
                          {docTitleName}
                        </div>
                      </div>
                    </td>

                    {/* 2. แผนกและสิทธิ์การเข้าถึง (Dept & Access) */}
                    <td className="py-2.5 px-3 align-middle">
                      {isSupersededTab ? (() => {
                        const deptVal = (primaryDoc.department || primaryDoc.dept || primaryDoc.owner_dept || canonicalDept || '-').trim().toUpperCase();
                        const style = getDeptBadgeStyle(deptVal);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${style.badge}`}>
                            <Building2 className={`w-3 h-3 shrink-0 ${style.icon}`} />
                            <span>{deptVal}</span>
                          </span>
                        );
                      })() : (
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-semibold text-xs text-slate-800">
                            {canonicalDept}
                          </span>
                          <div>
                            {renderSecurityBadge(primaryDoc)}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 3. ฉบับและวันบังคับใช้เดิม (Clean Text Summary) */}
                    <td className="py-2.5 px-3 align-middle">
                      {isSupersededTab ? (() => {
                        const rawRevs = item.revisions || (item.docs ? item.docs : [primaryDoc]);
                        const revs = rawRevs.filter(r => {
                          const st = (r.status || '').toUpperCase();
                          return st !== 'EFFECTIVE' && st !== 'ACTIVE' && st !== 'APPROVED' && st !== 'PUBLISHED' && !r.is_active;
                        });
                        const earliestRev = revs && revs.length > 0 ? (revs[revs.length - 1].revision || revs[revs.length - 1].rev || '00') : '00';
                        const latestRev = revs && revs.length > 0 ? (revs[0].revision || revs[0].rev || '00') : '00';
                        const supersededDate = revs?.[0]?.effectiveDate || revs?.[0]?.supersededAt || revs?.[0]?.effective_date || primaryDoc.effectiveDate || '-';

                        return (
                          <div className="flex flex-col items-start gap-0.5">
                            <div className="text-xs font-semibold text-slate-700">
                              {revs && revs.length > 1
                                ? `Rev.${earliestRev} – Rev.${latestRev}`
                                : `Rev.${latestRev}`}
                              <span className="text-slate-400 font-normal ml-1.5">
                                ({revs?.length || 1} ฉบับเดิม)
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              ตกรุ่นเมื่อ: {supersededDate}
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="font-mono font-bold text-xs sm:text-sm text-slate-800">
                            Rev.{revFormatted}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500" title="วันที่มีผลบังคับใช้">
                            {effDateDisplay}
                          </span>
                          {/* ISO 9001 Clause 7.5.3 — Periodic Review Due Badge */}
                          {isEffective && (() => {
                            const sch = (periodicReviewSchedules || []).find(
                              s => s.documentId === primaryDoc.id || s.externalDocumentId === primaryDoc.id
                            );
                            let reviewDue = sch?.nextReviewDate || sch?.currentScheduledReviewDate || primaryDoc.nextReviewDate;
                            if (!reviewDue && (primaryDoc.effectiveDate || primaryDoc.effective_date)) {
                              const eff = primaryDoc.effectiveDate || primaryDoc.effective_date;
                              const cycleYears = getReviewCycleYears(primaryDoc.docType || primaryDoc.document_code || primaryDoc.title || '');
                              reviewDue = addYears(eff, cycleYears);
                            }
                            if (!reviewDue) return null;
                            const isPendingApproval = primaryDoc.review_status === 'PENDING_APPROVAL' || sch?.status === 'PENDING_APPROVAL';
                            if (isPendingApproval) {
                              return (
                                <span
                                  className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-amber-50 text-amber-800 border-amber-200"
                                  title="อยู่ระหว่างรอหัวหน้าแผนกพิจารณาอนุมัติผลการทบทวน"
                                >
                                  ⏳ รออนุมัติผล
                                </span>
                              );
                            }
                            const todayRef = getEffectiveToday ? getEffectiveToday() : (simulatedSystemDate ? new Date(simulatedSystemDate) : new Date());
                            const st = evaluateDocumentReviewStatus(reviewDue, todayRef);
                            if (st === 'UP_TO_DATE') return null; // silent when not due soon
                            const cfg = st === 'OVERDUE'
                              ? { label: '🚨 เกินกำหนดทบทวน', cls: 'bg-red-50 text-red-600 border-red-200' }
                              : { label: '⚠️ ใกล้ทบทวน', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
                            return (
                              <span
                                className={`mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cfg.cls}`}
                                title={`กำหนดทบทวน: ${reviewDue}`}
                              >
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </td>

                    {/* 4. สายอนุมัติและสำเนา หรือ สรุปสถานะการเรียกคืน */}
                    <td className="py-2.5 px-3 align-middle">
                      {isSupersededTab ? (() => {
                        const pendingList = item.pendingRecalls || [];
                        const revs = item.revisions || [primaryDoc];
                        const totalPhysicalCopies = revs.reduce((acc, r) => acc + (r.totalCount || 0), 0);

                        if (pendingList.length > 0) {
                          const summaryText = pendingList.map(p => {
                            const pRev = String(p.rev || p.revision || '00').padStart(2, '0');
                            const pCnt = p.pendingCopiesCount ?? (p.totalCount - p.recalledCount);
                            const pTot = p.totalCount || 1;
                            return `Rev.${pRev}: ${pCnt}/${pTot} เล่ม`;
                          }).join(', ');

                          return (
                            <span 
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs"
                              title={`มีสำเนาควบคุมรอเรียกคืน: ${summaryText}`}
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>รอเรียกคืน ({summaryText})</span>
                            </span>
                          );
                        }

                        return (
                          <span 
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs"
                            title={totalPhysicalCopies === 0 ? "ไม่มีสำเนาควบคุมทางกายภาพค้างเรียกคืน" : "เรียกคืนและทำลายสำเนาครบถ้วนทุกฉบับแล้ว"}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>เรียกคืนครบแล้ว</span>
                          </span>
                        );
                      })() : (
                        <div className="flex flex-col items-start gap-1">
                          <span 
                            className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-medium"
                            title={distSummary.tooltip}
                          >
                            <Share2 size={11} className="text-slate-400" />
                            <span>{distSummary.count > 0 ? `${distSummary.count} จุดแจกจ่าย` : 'สำเนาดิจิทัล'}</span>
                          </span>

                          <div 
                            className="text-[11px] text-slate-500 truncate max-w-[190px]"
                            title={`ผู้ขอ: ${workflow.req} | ผู้ทบทวน: ${workflow.rev} | ผู้อนุมัติ: ${workflow.app}`}
                          >
                            <span>ผู้ขอ:</span> <strong className="font-medium text-slate-700">{workflow.req}</strong> · <span>อนุมัติ:</span> <strong className="font-medium text-slate-700">{workflow.app}</strong>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 5. สถานะเอกสาร (Master Lifecycle Status) */}
                    <td className="py-2.5 px-3 align-middle">
                      <div className="flex flex-col items-start gap-1">
                        {isSupersededTab ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            ฉบับตกรุ่น ({(item.revisions || item.docs || []).length || 1} ฉบับ)
                          </span>
                        ) : (
                          renderLifecycleBadge(primaryDoc, activeRevisionsList, isObsoleteTab, isSupersededTab)
                        )}
                      </div>
                    </td>

                    {/* 6. เครื่องมือและการจัดการ (Actions - Far Right Column) */}
                    {filterStatus !== 'OBSOLETE' && (
                      <td className={`px-3 py-2.5 whitespace-nowrap text-xs text-right ${isMenuOpen ? 'relative z-50' : 'relative z-1'}`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 dropdown-action-dock">
                          {/* ปุ่มเปิดดูรายละเอียด (Eye Preview Button) */}
                          <button
                            type="button"
                            title="ดูรายละเอียดเอกสาร"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewDoc(primaryDoc);
                            }}
                            className="p-1.5 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <Eye size={14} />
                          </button>

                          {/* ปุ่มดาวน์โหลดด่วน (Minimal Ghost Download Button) */}
                          {canDownloadDocument(primaryDoc, currentUser) && (
                            <button
                              type="button"
                              title={(() => {
                                const docCode = primaryDoc.document_code || primaryDoc.doc_code || primaryDoc.title || '';
                                const dt = (primaryDoc.docType || primaryDoc.doc_type || primaryDoc.type || docCode.split('-')[0] || '').toUpperCase();
                                if (dt === 'FM' || dt === 'FORM') return 'ดาวน์โหลดแบบฟอร์ม (ไม่มีลายน้ำ)';
                                if (isDccUser) return 'ดาวน์โหลด Master Document (DCC)';
                                return 'ดาวน์โหลดสำเนาไม่ควบคุม (UNCONTROLLED COPY)';
                              })()}
                              onClick={(e) => {
                                e.stopPropagation();
                                const docCode = primaryDoc.document_code || primaryDoc.doc_code || primaryDoc.title || '';
                                const dt = (primaryDoc.docType || primaryDoc.doc_type || primaryDoc.type || docCode.split('-')[0] || '').toUpperCase();
                                if (dt === 'FM' || dt === 'FORM') {
                                  handleDownloadUncontrolled(primaryDoc, e, false);
                                } else if (isDccUser) {
                                  handleDownloadMaster(primaryDoc, e);
                                } else {
                                  handleDownloadUncontrolled(primaryDoc, e, false);
                                }
                              }}
                              className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Download size={14} />
                            </button>
                          )}

                          {/* ปุ่มเปิดเมนูเพิ่มเติม (...) */}
                          <div className="relative">
                            <button
                              type="button"
                              title="เมนูการจัดการเพิ่มเติม"
                              aria-label="เมนูเพิ่มเติม"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuDocId(isMenuOpen ? null : primaryDoc.id);
                              }}
                              className={`p-1.5 rounded transition-colors cursor-pointer ${
                                isMenuOpen
                                  ? 'bg-slate-900 text-white shadow-xs'
                                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                              }`}
                            >
                              <MoreHorizontal size={14} />
                            </button>

                            {/* Overflow Dropdown Menu */}
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`overflow-dropdown-menu absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 divide-y divide-slate-100 animate-in fade-in-50 zoom-in-95 duration-100 ${
                                isMenuOpen ? 'block' : 'hidden'
                              }`}
                            >

                              {/* กลุ่มที่ 2: ฟังก์ชัน DCC */}
                              {isDccUser && (
                                <div className="py-1">
                                  <button
                                    type="button"
                                    title="ดาวน์โหลดไฟล์ต้นฉบับแท้โดยไม่มีการประทับลายน้ำ (Clean Master ISO 9001)"
                                    onClick={(e) => {
                                      setOpenMenuDocId(null);
                                      handleDownloadCleanMaster(primaryDoc, e);
                                    }}
                                    className="w-full px-3.5 py-2 text-left text-xs text-emerald-800 hover:bg-emerald-50 flex items-center gap-2.5 transition-colors font-semibold group cursor-pointer"
                                  >
                                    <ShieldCheck className="text-emerald-600 shrink-0" size={14} />
                                    <span>ดาวน์โหลดต้นฉบับ (ไม่ติดลายน้ำ)</span>
                                  </button>

                                  <button
                                    type="button"
                                    title="ดาวน์โหลดสำหรับแจกจ่ายภายนอก (External Release)"
                                    onClick={(e) => {
                                      setOpenMenuDocId(null);
                                      handleDownloadExternal(primaryDoc, e);
                                    }}
                                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 hover:text-emerald-600 flex items-center gap-2.5 transition-colors font-medium group cursor-pointer"
                                  >
                                    <Globe className="text-slate-400 group-hover:text-emerald-500 shrink-0" size={14} />
                                    <span>ดาวน์โหลด External Release</span>
                                  </button>

                                </div>
                              )}

                              {/* กลุ่มที่ 3: การขอสำเนาควบคุม */}
                              {isOwner && isEffective && !isFormDoc && (
                                <div className="py-1">
                                  <button
                                    type="button"
                                    title="ขอสำเนาควบคุมเพิ่มเติม"
                                    onClick={() => {
                                      setOpenMenuDocId(null);
                                      handleRequestAdditionalCopy(primaryDoc);
                                    }}
                                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2.5 transition-colors font-medium group cursor-pointer"
                                  >
                                    <PlusCircle className="text-blue-500 shrink-0" size={14} />
                                    <span>ขอสำเนาควบคุมเพิ่มเติม</span>
                                  </button>
                                </div>
                              )}

                              {/* กลุ่มที่ 4: DAR Workflow Actions */}
                              {isOwner && isEffective && (
                                <div className="py-1">
                                  <button
                                    type="button"
                                    title="ยื่นคำร้องขอแก้ไขฉบับใหม่"
                                    onClick={() => {
                                      setOpenMenuDocId(null);
                                      handleInitiateRevision(primaryDoc);
                                    }}
                                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2.5 transition-colors font-medium group cursor-pointer"
                                  >
                                    <Edit3 className="text-amber-500 shrink-0" size={14} />
                                    <span>ยื่นคำร้องขอแก้ไขฉบับใหม่</span>
                                  </button>

                                  <button
                                    type="button"
                                    title="ขอยกเลิกเอกสารฉบับนี้"
                                    onClick={() => {
                                      setOpenMenuDocId(null);
                                      handleInitiateObsolete(primaryDoc);
                                    }}
                                    className="w-full px-3.5 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors font-medium group cursor-pointer"
                                  >
                                    <GitFork className="text-rose-500 shrink-0" size={14} />
                                    <span>ขอยกเลิกเอกสารฉบับนี้</span>
                                  </button>
                                </div>
                              )}

                              {hasActiveCopiesToReport && (
                                <div className="py-1">
                                  <button
                                    type="button"
                                    title="แจ้งเอกสารชำรุด หรือสูญหาย เพื่อขอออกเล่มทดแทน"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuDocId(null);
                                      const targetCopy = myDeptActiveCopies[0] || (controlledCopyInstances || []).find(c => 
                                        (String(c.docId || c.doc_id) === String(primaryDoc.id) || c.doc_code === docCode) &&
                                        ['ISSUED_ACTIVE', 'ACTIVE'].includes(c.status)
                                      );
                                      if (targetCopy) {
                                        setReplacementInstance(targetCopy);
                                      } else {
                                        toast.error('ไม่พบสำเนาควบคุมที่ใช้งานอยู่สำหรับเอกสารนี้');
                                      }
                                    }}
                                    className="w-full px-3.5 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors font-medium group cursor-pointer"
                                  >
                                    <AlertTriangle className="text-rose-500 shrink-0" size={14} />
                                    <span>แจ้งชำรุด หรือสูญหาย</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>

                  {/* Accordion Inset Panel for Sub-table */}
                  {isExpanded && (
                    <tr className="bg-[#F8FAFC]/80 border-b border-[#E2E8F0]">
                      <td colSpan={filterStatus === 'OBSOLETE' || filterStatus === 'SUPERSEDED' ? 5 : 6} className="p-3 pl-8 pr-4">
                        <div className="max-w-5xl bg-white rounded-xl border border-[#CBD5E1] border-l-4 border-l-[#0D99FF] shadow-xs overflow-hidden">
                          {/* Inset Sub-table Header */}
                          <div className="px-4 py-2.5 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Layers size={14} className="text-[#0D99FF]" />
                              <span className="text-xs font-bold text-[#1E293B]">
                                ประวัติฉบับย่อยของ {docCode} ({activeRevisionsList.length} ฉบับ)
                              </span>
                            </div>
                            <span className="text-[11px] text-[#64748B] font-mono bg-white px-2 py-0.5 rounded border border-[#CBD5E1]">
                              {activeRevisionsList.length > 1 
                                ? `Rev.${String(activeRevisionsList[activeRevisionsList.length - 1]?.rev || '00').padStart(2, '0')} - Rev.${String(activeRevisionsList[0]?.rev || '00').padStart(2, '0')}` 
                                : `Rev.${revFormatted}`}
                            </span>
                          </div>

                          {/* Compact High-Density Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-[#F8FAFC] text-[#475569] font-semibold border-b border-[#E2E8F0]">
                                  <th className="py-2.5 px-3.5 w-24">Revision</th>
                                  <th className="py-2.5 px-3.5 w-48 font-mono">ช่วงเวลาบังคับใช้ (เริ่ม - สิ้นสุด)</th>
                                  <th className="py-2.5 px-3.5 min-w-[220px]">เหตุผลการปรับปรุง</th>
                                  <th className="py-2.5 px-3.5 w-28 text-center">สถานะฉบับย่อย</th>
                                  <th className="py-2.5 px-3.5 w-36 text-center">การจัดการ / ดาวน์โหลด</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#F1F5F9]">
                                {activeRevisionsList.map((subDoc) => {
                                  const subDar = (dars || []).find(d => d.id === subDoc.darId) ||
                                    (dars || []).find(d => String(d.docId || d.doc_id) === String(subDoc.id) || (d.title || d.doc_code) === (subDoc.title || subDoc.doc_code));
                                  const subRevNum = String(subDoc.rev || subDoc.revision || '00').padStart(2, '0');
                                  const effDate = subDoc.effectiveDate || subDoc.effective_date || '-';
                                  const endDate = subDoc.superseded_at 
                                    ? subDoc.superseded_at.split('T')[0]
                                    : (subDoc.obsoleted_at 
                                        ? subDoc.obsoleted_at.split('T')[0] 
                                        : (subDoc.outdatedDate || '-'));
                                  const dateRange = (effDate !== '-' || endDate !== '-') ? `${effDate} ~ ${endDate}` : '-';
                                  const revNote = subDoc.revisionNote || subDoc.revision_note || subDoc.changeDetail || subDar?.changeDetails || subDar?.reason || subDoc.reason || 'จัดทำเอกสารฉบับเริ่มต้น (Genesis)';
                                  const isSubActive = subDoc.status === 'EFFECTIVE' || subDoc.status === 'ACTIVE';
                                  const isSubObsolete = subDoc.status === 'OBSOLETE' || subDoc.is_obsolete;

                                  return (
                                    <tr 
                                      key={subDoc.id || `${docCode}-${subRevNum}`} 
                                      className="hover:bg-[#F0F7FF]/60 transition-colors cursor-pointer"
                                      onClick={() => setPreviewDoc(subDoc)}
                                    >
                                      <td className="py-2.5 px-3.5 font-mono font-bold text-[#1E293B]">
                                        <span className="bg-[#F1F5F9] text-[#334155] px-2 py-0.5 rounded border border-[#CBD5E1]">
                                          Rev.{subRevNum}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3.5 font-mono text-[#64748B] whitespace-nowrap">
                                        {dateRange}
                                      </td>
                                      <td className="py-2.5 px-3.5 text-[#334155] leading-relaxed">
                                        <span className="line-clamp-2" title={revNote}>{revNote}</span>
                                      </td>
                                      <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                                        {isSubActive ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E6F7ED] text-[#14AE5C] border border-[#B3E7C9]">
                                            บังคับใช้
                                          </span>
                                        ) : isSubObsolete ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5]">
                                            ยกเลิก
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]">
                                            ตกรุ่น
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            title="เปิดดูในแท็บใหม่ (Full Viewer)"
                                            onClick={(e) => handleDownloadUncontrolled(subDoc, e, true)}
                                            className="p-1.5 rounded border border-[#CBD5E1] bg-white text-[#475569] hover:text-[#0D99FF] hover:border-[#0D99FF] hover:bg-[#F0F7FF] transition-colors cursor-pointer"
                                          >
                                            <ExternalLink size={13} />
                                          </button>
                                          {canDownloadDocument(subDoc, currentUser) && (
                                            <button
                                              type="button"
                                              title={(() => {
                                                const subCode = subDoc.document_code || subDoc.doc_code || subDoc.title || '';
                                                const dt = (subDoc.docType || subDoc.doc_type || subDoc.type || subCode.split('-')[0] || '').toUpperCase();
                                                if (dt === 'FM' || dt === 'FORM') return 'ดาวน์โหลดแบบฟอร์ม (ไม่มีลายน้ำ)';
                                                if (isDccUser) return 'ดาวน์โหลด Master PDF';
                                                return 'ดาวน์โหลดสำเนาไม่ควบคุม (UNCONTROLLED COPY)';
                                              })()}
                                              onClick={(e) => {
                                                const subCode = subDoc.document_code || subDoc.doc_code || subDoc.title || '';
                                                const dt = (subDoc.docType || subDoc.doc_type || subDoc.type || subCode.split('-')[0] || '').toUpperCase();
                                                if (dt === 'FM' || dt === 'FORM') {
                                                  handleDownloadUncontrolled(subDoc, e, false);
                                                } else if (isDccUser) {
                                                  handleDownloadMaster(subDoc, e);
                                                } else {
                                                  handleDownloadUncontrolled(subDoc, e, false);
                                                }
                                              }}
                                              className="p-1.5 rounded border border-[#CBD5E1] bg-white text-[#475569] hover:text-[#0D99FF] hover:border-[#0D99FF] hover:bg-[#F0F7FF] transition-colors cursor-pointer"
                                            >
                                              <Download size={13} />
                                            </button>
                                          )}
                                          {isDccUser && (
                                            <button
                                              type="button"
                                              title="ดาวน์โหลดต้นฉบับ Clean Master"
                                              onClick={(e) => handleDownloadCleanMaster(subDoc, e)}
                                              className="p-1.5 rounded border border-[#B3E7C9] bg-[#E6F7ED] text-[#14AE5C] hover:bg-[#C9F0D9] transition-colors cursor-pointer"
                                            >
                                              <ShieldCheck size={13} />
                                            </button>
                                          )}
                                        </div>
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
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={filterStatus === 'OBSOLETE' || filterStatus === 'SUPERSEDED' ? 5 : 6} className="py-12 text-center">
                  <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm text-slate-500 font-medium">ไม่พบเอกสารในหมวดหมู่นี้</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        currentPage={currentPage}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 pb-4">
      {/* ── Single-Canvas Clean Container (Header + Filters + Table unified) ── */}
      <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-xs flex-1 flex flex-col min-h-0">
        
        {/* 1. Header Strip: Title + Scope Tabs (Standardized Page Header) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-slate-700 shrink-0" strokeWidth={1.75} />
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                คลังเอกสารแม่บท
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                ทะเบียนควบคุมเอกสารคุณภาพและระเบียบปฏิบัติงานภายในตามระบบบริหารคุณภาพ
              </p>
            </div>
          </div>

          {/* 3 Scope Tabs: Minimal Segmented Pills */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-lg overflow-x-auto shrink-0 text-xs">
            {isDccUser && (
              <button
                type="button"
                title="ทะเบียนเอกสารทุกแผนก ทุกสถานะ (เฉพาะ DCC)"
                aria-label="ทุกแผนก (DCC)"
                onClick={() => handleSelectTab(TAB_ALL_DEPTS)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === TAB_ALL_DEPTS
                    ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
                }`}
              >
                <Layers size={13} className={activeTab === TAB_ALL_DEPTS ? 'text-blue-600' : 'text-slate-400'} />
                <span>ทุกแผนก (DCC)</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                  activeTab === TAB_ALL_DEPTS ? 'bg-blue-50 text-blue-700 border border-blue-200/80' : 'bg-slate-200/80 text-slate-600'
                }`}>
                  {allDeptsDocsCount}
                </span>
              </button>
            )}

            {/* Tab 1: เอกสารทั่วไป */}
            <button
              type="button"
              title="เอกสารส่วนกลาง / เอกสารทั่วไปของแผนกอื่น"
              aria-label="เอกสารทั่วไป (เอกสารส่วนกลาง / เอกสารทั่วไปของแผนกอื่น)"
              onClick={() => handleSelectTab(TAB_GENERAL)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === TAB_GENERAL || activeTab === 'general'
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
              }`}
            >
              <Globe size={13} className={activeTab === TAB_GENERAL || activeTab === 'general' ? 'text-blue-600' : 'text-slate-400'} />
              <span>เอกสารทั่วไป</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                activeTab === TAB_GENERAL || activeTab === 'general'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                  : 'bg-slate-200/80 text-slate-600'
              }`}>
                {generalDocsCount}
              </span>
            </button>

            {/* Tab 2: เอกสารในแผนกฉัน */}
            <button
              type="button"
              aria-label="เอกสารในแผนกฉัน"
              onClick={() => handleSelectTab(TAB_MY_DEPT)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === TAB_MY_DEPT || activeTab === 'dept'
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
              }`}
            >
              <Building2 size={13} className={activeTab === TAB_MY_DEPT || activeTab === 'dept' ? 'text-blue-600' : 'text-slate-400'} />
              <span>ในแผนกฉัน</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                activeTab === TAB_MY_DEPT || activeTab === 'dept'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                  : 'bg-slate-200/80 text-slate-600'
              }`}>
                {myDeptDocsCount}
              </span>
            </button>

            {/* Tab 3: เอกสารที่ได้รับการแจกจ่าย */}
            <button
              type="button"
              aria-label="เอกสารที่ได้รับการแจกจ่าย"
              onClick={() => handleSelectTab(TAB_DISTRIBUTED)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === TAB_DISTRIBUTED || activeTab === 'dist'
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
              }`}
            >
              <Share2 size={13} className={activeTab === TAB_DISTRIBUTED || activeTab === 'dist' ? 'text-blue-600' : 'text-slate-400'} />
              <span>ที่ได้รับการแจกจ่าย</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                activeTab === TAB_DISTRIBUTED || activeTab === 'dist'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                : 'bg-slate-200/80 text-slate-600'
              }`}>
                {distributedDocsCount}
              </span>
            </button>
          </div>
        </div>

        {/* 2. Unified Filter Toolbar (Directly part of canvas) */}
        <div className="p-4 space-y-2 border-b border-slate-100 bg-white shrink-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2.5 w-full">
            {/* Search Input: Compact (h-10 / text-sm) */}
            <div className="relative flex-1 min-w-[200px] sm:min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
              <input
                type="text"
                placeholder="ค้นหารหัส หรือชื่อเอกสาร..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-9 pr-7 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none transition-all shadow-xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Dropdowns: Responsive & Compact */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Department Filter */}
              <select
                value={filterDept || 'ALL'}
                onChange={(e) => setFilterDept(e.target.value)}
                className="w-auto sm:w-[130px] xl:w-[140px] h-10 py-2 px-2.5 bg-slate-50 hover:bg-white border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-sm text-slate-700 focus:outline-none transition-all cursor-pointer shadow-xs truncate"
              >
                <option value="ALL">ทุกแผนก (All)</option>
                {availableDepts.map(d => (
                  <option key={d.id} value={d.id}>{d.name || d.id}</option>
                ))}
              </select>

              {/* Document Type */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-auto sm:w-[130px] xl:w-[140px] h-10 py-2 px-2.5 bg-slate-50 hover:bg-white border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-sm text-slate-700 focus:outline-none transition-all cursor-pointer shadow-xs truncate"
              >
                <option value="ALL">ทุกประเภท (Types)</option>
                {availableTypes.map(t => {
                  const matchedType = (documentTypes || []).find(dt => (dt.code || dt.id) === t);
                  const label = matchedType ? `${matchedType.nameTh || matchedType.name} (${t})` : t;
                  return <option key={t} value={t}>{label}</option>;
                })}
              </select>

              {/* Standards */}
              <select
                value={filterStandard || 'ALL'}
                onChange={(e) => setFilterStandard(e.target.value)}
                className="w-auto sm:w-[125px] xl:w-[135px] h-10 py-2 px-2.5 bg-slate-50 hover:bg-white border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-sm text-slate-700 focus:outline-none transition-all cursor-pointer shadow-xs truncate"
              >
                <option value="ALL">ทุกมาตรฐาน</option>
                {availableStandards.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Access Scope */}
              <select
                value={filterAccessScope || 'ALL'}
                onChange={(e) => setFilterAccessScope(e.target.value)}
                className="w-auto sm:w-[125px] xl:w-[135px] h-10 py-2 px-2.5 bg-slate-50 hover:bg-white border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-sm text-slate-700 focus:outline-none transition-all cursor-pointer shadow-xs truncate"
              >
                <option value="ALL">ทุกระดับความลับ</option>
                <option value="GENERAL">ทั่วไป (General)</option>
                <option value="DEPT_ONLY">เฉพาะแผนก (Dept Only)</option>
                <option value="TARGETED">ระบุแผนก (Targeted)</option>
                <option value="RESTRICTED">ลับเฉพาะ (Restricted)</option>
              </select>
            </div>

            {/* Active Pill Badge (Inline Filter Chip) for General / Distributed tabs */}
            {!showsStatusTabs && (
              <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shadow-xs bg-emerald-50 text-emerald-800 border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>เฉพาะฉบับบังคับใช้</span>
              </span>
            )}

            {/* Export Button */}
            {(activeTab === TAB_MY_DEPT || activeTab === 'dept' || isDccUser) && (
              <button
                type="button"
                onClick={handleExport}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 h-10 px-3 text-sm font-semibold bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg whitespace-nowrap cursor-pointer transition-all shadow-xs ml-auto sm:ml-0"
              >
                <Download className="text-slate-500 shrink-0" size={13} />
                <span>{isDccUser ? 'ส่งออกแม่บท' : 'ส่งออกแผนก'}</span>
              </button>
            )}
          </div>



          {/* Universal Status Tabs (เฉพาะในเมนู "เอกสารในแผนกฉัน" เท่านั้น) */}
          {showsStatusTabs && (
            <div className="pt-2.5 border-t border-[#F1F5F9] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
              {/* Responsive Scrollable & Wrap Capsule Pill Container */}
              <div className="w-full sm:w-auto overflow-x-auto scrollbar-hide py-0.5">
                <div className="inline-flex p-1 bg-slate-100/80 rounded-xl gap-1 shrink-0 whitespace-nowrap">
                  {[
                    { id: 'ACTIVE', label: 'มีผลบังคับใช้ (Active)', count: tabCounts.active, ariaLabel: 'มีผลบังคับใช้ (Active)' },
                    { id: 'SUPERSEDED', label: 'ฉบับตกรุ่น (Superseded)', count: tabCounts.superseded, ariaLabel: 'ฉบับตกรุ่น (Superseded) ฉบับเดิมตกรุ่น ตกรุ่น' },
                    { id: 'OBSOLETE', label: 'ยกเลิกถาวร (Obsolete)', count: tabCounts.obsolete, ariaLabel: 'ยกเลิกถาวร (Obsolete) ยกเลิกการใช้งาน' },
                  ].map((tab) => {
                    const isSelected = (filterStatus === tab.id) || (tab.id === 'ACTIVE' && filterStatus === 'EFFECTIVE');
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        aria-label={tab.ariaLabel || tab.label}
                        onClick={() => setFilterStatus(tab.id === 'ALL' ? '' : (tab.id === 'ACTIVE' ? 'EFFECTIVE' : tab.id))}
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

              <div className="flex items-center justify-between sm:justify-end gap-2.5 text-[11px] text-slate-500 shrink-0">
                {(filterType !== 'ALL' && filterType !== '') || (filterDept !== 'ALL' && filterDept !== '') || (filterStandard !== 'ALL' && filterStandard !== '') || searchTerm || filterAccessScope !== '' || (filterStatus !== 'EFFECTIVE' && filterStatus !== '' && filterStatus !== 'ACTIVE') ? (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-rose-600 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={11} />
                    <span>ล้างตัวกรอง</span>
                  </button>
                ) : null}
                <span className="font-mono">
                  แสดงผล <strong className="text-slate-900 font-bold">{isGroupedView ? `${groupedDocs.length} รายการ` : `${filteredDocs.length} รายการ`}</strong> / {currentStatusTabTotal} รายการ
                </span>
              </div>
            </div>
          )}

          {/* Status Count for General & Distributed Tabs */}
          {!showsStatusTabs && (
            <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <div>
                {(filterType !== 'ALL' && filterType !== '') || (filterDept !== 'ALL' && filterDept !== '') || (filterStandard !== 'ALL' && filterStandard !== '') || searchTerm || (filterAccessScope !== '' && filterAccessScope !== 'ALL') ? (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-rose-600 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={11} />
                    <span>ล้างตัวกรองทั้งหมด</span>
                  </button>
                ) : null}
              </div>
              <span className="font-mono">
                แสดงผล <strong className="text-slate-900 font-bold">{filteredDocs.length}</strong> จากทั้งหมด {tabFilteredDocs.length} รายการ
              </span>
            </div>
          )}
        </div>

        {/* 3. Table directly rendered on Canvas */}
        {renderFlatTable()}
      </div>

      {/* Document Detail Modal */}
      {previewDoc && (
        <DocumentDetailModal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          document={previewDoc}
          filterStatus={filterStatus}
          activeTab={activeTab}
          onOpenViewer={(d) => navigate(`/viewer/${d.id}/${d.rev || d.revision || '01'}`)}
        />
      )}

      {/* Replacement Modal */}
      {replacementInstance && (
        <ReplacementModal
          isOpen={!!replacementInstance}
          onClose={async (success, type, reason) => {
            if (success && type && reason) {
              try {
                if ((await reportCcDamagedLost(replacementInstance.id, type, reason)) === false) return;
                toast.success('ยื่นคำร้องขอสำเนาทดแทนเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่ DCC จัดพิมพ์และส่งมอบ');
                setReplacementInstance(null);
              } catch (err) {
                console.error('[Library] reportCcDamagedLost failed:', err);
                toast.error(err?.message || 'เกิดข้อผิดพลาดในการทำรายการ');
                throw err;
              }
            } else {
              setReplacementInstance(null);
            }
          }}
          instance={replacementInstance}
        />
      )}

      {/* Ad-Hoc Additional Copies Modal */}
      {adHocDoc && (
        <RequestAdditionalCopiesModal
          isOpen={!!adHocDoc}
          onClose={() => setAdHocDoc(null)}
          document={adHocDoc}
        />
      )}
    </div>
  );
};

export default Library;
