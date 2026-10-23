import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore, { getActiveDarForDocument } from '../../../../store/useStore';

import { Database, Download, Search, Eye, X, FilterX, ChevronDown, CheckCircle2, Globe, Building2, Share2, Lock } from 'lucide-react';

export const DropdownMenu = ({ children, className = '' }) => (
  <div className={`inline-flex items-center gap-1.5 ${className}`}>{children}</div>
);

export const DropdownMenuItem = ({ disabled, onClick, title, className = '', children, ...props }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={disabled ? undefined : onClick}
    title={title}
    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
      disabled 
        ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200' 
        : 'cursor-pointer hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
    } ${className}`}
    {...props}
  >
    {children}
  </button>
);


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
import EmptyState from '../../../../shared/components/EmptyState';
import { getRequesterName, getReviewerName, getApproverName, getAckNames } from '../../utils/darHelper';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import { UniversalWatermarkService, WATERMARK_TYPES } from '../../services/UniversalWatermarkService';
import toast from 'react-hot-toast';

const MasterList = () => {
  const { 
    documents, 
    currentUser, 
    dars, 
    timeline, 
    masterUsers,
    documentTypes,
    masterDepartments,
    departments: storeDepts
  } = useStore();
  
  // Access Control
  const isAdmin = currentUser?.level >= 5 || currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN';
  const isDccAdmin = Boolean(
    currentUser?.isDcc || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.isDccAdmin || 
    currentUser?.department === 'DC' || 
    currentUser?.department === 'DCC'
  );
  
  const navigate = useNavigate();

  const handleOpenRevision = (doc) => {
    const docCode = doc.code || doc.document_code || doc.docNo || doc.title;
    navigate(`/dcc/dar/new/revision?docCode=${encodeURIComponent(docCode)}`);
  };

  const handleOpenObsolete = (doc) => {
    const docCode = doc.code || doc.document_code || doc.docNo || doc.title;
    navigate(`/dcc/dar/new/obsolete?docCode=${encodeURIComponent(docCode)}`);
  };

  
  const [selectedScope, setSelectedScope] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedStandard, setSelectedStandard] = useState('ALL');
  const [selectedSecurity, setSelectedSecurity] = useState('ALL');
  const [masterListStatus, setMasterListStatus] = useState('ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');

  const userDept = currentUser?.department || 'DC';
  const affiliatedDepts = useMemo(() => {
    return currentUser?.affiliatedDepartments || currentUser?.affiliated_departments || [userDept];
  }, [currentUser, userDept]);

  const filteredByScope = useMemo(() => {
    return (documents || []).filter((doc) => {
      const docDept = doc.department || doc.owner_dept || doc.dept_code || (doc.code?.includes('-QC-') ? 'QC' : (doc.docNo?.includes('-QC-') ? 'QC' : ''));
      const isMyDeptDoc = affiliatedDepts.includes(docDept) || (docDept && docDept === userDept);

      switch (selectedScope) {
        case 'MY_DEPT':
          // ✅ เฉพาะเอกสารที่แผนกฉันเป็นเจ้าของ
          return isMyDeptDoc;
        case 'GENERAL':
        case 'PUBLIC':
          // ✅ เอกสารทั่วไป/ส่วนกลาง หรือเอกสารแผนกอื่นที่อนุญาตให้อ่าน โดย "ต้องไม่ซ้ำกับเอกสารในแผนกฉัน"
          return !isMyDeptDoc && (
            doc.access_level === 'PUBLIC' || 
            doc.is_public === true || 
            doc.access_control?.scope === 'GENERAL' || 
            doc.access_scope === 'GENERAL' || 
            doc.scope === 'GENERAL' || 
            !docDept
          );
        case 'DISTRIBUTED':
          // ✅ เอกสารที่มีสำเนาแจกจ่ายมายังแผนกของฉัน
          return (doc.distributed_departments || doc.distributed_depts || []).includes(userDept);
        default:
          return true;
      }
    });
  }, [documents, selectedScope, affiliatedDepts, userDept]);

  const myDeptCount = useMemo(() => {
    return (documents || []).filter((doc) => {
      const docDept = doc.department || doc.owner_dept || doc.dept_code || (doc.code?.includes('-QC-') ? 'QC' : (doc.docNo?.includes('-QC-') ? 'QC' : ''));
      return affiliatedDepts.includes(docDept) || (docDept && docDept === userDept);
    }).length;
  }, [documents, affiliatedDepts, userDept]);

  const generalCount = useMemo(() => {
    return (documents || []).filter((doc) => {
      const docDept = doc.department || doc.owner_dept || doc.dept_code || (doc.code?.includes('-QC-') ? 'QC' : (doc.docNo?.includes('-QC-') ? 'QC' : ''));
      const isMyDeptDoc = affiliatedDepts.includes(docDept) || (docDept && docDept === userDept);
      return !isMyDeptDoc && (
        doc.access_level === 'PUBLIC' || 
        doc.is_public === true || 
        doc.access_control?.scope === 'GENERAL' || 
        doc.access_scope === 'GENERAL' || 
        doc.scope === 'GENERAL' || 
        !docDept
      );
    }).length;
  }, [documents, affiliatedDepts, userDept]);

  const distributedCount = useMemo(() => {
    return (documents || []).filter((doc) => {
      return (doc.distributed_departments || doc.distributed_depts || []).includes(userDept);
    }).length;
  }, [documents, userDept]);

  const masterListDept = selectedDept === 'ALL' ? '' : selectedDept;
  const [previewDoc, setPreviewDoc] = useState(null);
  const [isPreviewMenuOpen, setIsPreviewMenuOpen] = useState(false);
  const previewMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (previewMenuRef.current && !previewMenuRef.current.contains(e.target)) {
        setIsPreviewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownloadDoc = async (targetDoc, downloadMode = 'UNCONTROLLED') => {
    if (!targetDoc) return;
    try {
      let watermarkType = WATERMARK_TYPES.UNCONTROLLED_COPY;
      let isCleanMaster = false;

      if (downloadMode === 'CLEAN' || downloadMode === 'CLEAN_MASTER') {
        watermarkType = 'CLEAN';
        isCleanMaster = true;
      } else if (downloadMode === 'CONTROLLED' || downloadMode === 'CONTROLLED_COPY') {
        watermarkType = WATERMARK_TYPES.CONTROLLED_COPY;
      } else {
        watermarkType = WATERMARK_TYPES.UNCONTROLLED_COPY;
      }

      await UniversalWatermarkService.downloadWatermarkedPdf(targetDoc, watermarkType, {
        userName: currentUser?.name || 'Authorized User',
        userDept: currentUser?.department || currentUser?.dept || 'QMS',
        holderDept: targetDoc.department || currentUser?.department || 'DCC',
        location: targetDoc.location || targetDoc.pointOfUse || targetDoc.locationName || targetDoc.department || 'DCC Office',
        effectiveDate: targetDoc.effectiveDate,
        isCleanMaster,
        currentUser
      }, false);

      const label = isCleanMaster
        ? 'เอกสารแม่บทคลีน (Clean Master)'
        : (watermarkType === WATERMARK_TYPES.CONTROLLED_COPY ? 'สำเนาควบคุม (Controlled Copy)' : 'สำเนาไม่ควบคุม (Uncontrolled Copy)');

      toast.success(`ดาวน์โหลด ${label} สำเร็จ`);
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการดาวน์โหลดเอกสาร');
    }
  };

  const availableDepts = useMemo(() => [...new Set([
    ...(documents || []).map(d => d.department),
    ...(masterDepartments || storeDepts || []).filter(d => typeof d === 'string' || d.status !== 'INACTIVE').map(d => typeof d === 'string' ? d : d.id)
  ])].filter(Boolean).sort(), [documents, masterDepartments, storeDepts]);

  const availableTypes = useMemo(() => [...new Set([
    ...(documents || []).map(d => (d.title || '').split('-')[0]),
    ...(documentTypes || []).filter(t => t.status === 'ACTIVE' || t.status === 'Active' || t.isActive !== false).map(t => t.code || t.id)
  ])].filter(Boolean).sort(), [documents, documentTypes]);

  const availableStandards = useMemo(() => {
    const fromDocs = (documents || []).flatMap(d => d.relatedStandards || d.related_standards || []);
    return [...new Set([...fromDocs, 'ISO 9001', 'GHPs', 'HACCP', 'ISO 22000', 'BRC', 'HALAL'])].filter(Boolean).sort();
  }, [documents]);

  const departments = availableDepts;
  const docTypes = availableTypes;
  const standards = availableStandards;

  // Base Filter Logic (Dept, Type, Standard, Security, Search, Scope)
  const baseFilteredDocs = useMemo(() => {
    let docs = filteredByScope;
    
    if (!isAdmin) {
      docs = docs.filter(d => d.department === currentUser?.department);
    }

    if (selectedDept && selectedDept !== 'ALL') {
      docs = docs.filter(d => d.department === selectedDept);
    }
    
    if (selectedType && selectedType !== 'ALL') {
      docs = docs.filter(d => (d.title || '').startsWith(selectedType));
    }

    if (selectedStandard && selectedStandard !== 'ALL') {
      docs = docs.filter(d => {
        const stds = d.relatedStandards || d.related_standards || [];
        return stds.includes(selectedStandard);
      });
    }

    if (selectedSecurity && selectedSecurity !== 'ALL') {
      docs = docs.filter(d => {
        const sec = (d.security || d.accessScope || d.access_scope || 'PUBLIC').toUpperCase();
        if (selectedSecurity === 'PUBLIC') return sec === 'PUBLIC' || sec === 'GENERAL';
        if (selectedSecurity === 'CONFIDENTIAL') return sec === 'CONFIDENTIAL' || sec === 'RESTRICTED' || sec === 'DEPT_ONLY';
        return sec === selectedSecurity;
      });
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      docs = docs.filter(d => 
        (d.title || '').toLowerCase().includes(term) || (d.name || '').toLowerCase().includes(term)
      );
    }

    return docs;
  }, [
    filteredByScope,
    isAdmin,
    currentUser?.department,
    selectedDept,
    selectedType,
    selectedStandard,
    selectedSecurity,
    searchTerm
  ]);

  // 1. Single-Active ISO 9001: Active Documents (Exactly 1 active revision per document code)
  const activeDocs = useMemo(() => {
    const candidates = baseFilteredDocs.filter(d => {
      const st = (d.status || '').toUpperCase();
      const isEff = st === 'EFFECTIVE' || st === 'ACTIVE' || st === 'APPROVED' || st === 'PUBLISHED' || Boolean(d.is_active);
      const isSup = st === 'SUPERSEDED' || st === 'SUPERSEDED_ARCHIVED' || Boolean(d.is_superseded);
      const isObs = st === 'OBSOLETE' || st === 'OBSOLETE_ARCHIVED' || Boolean(d.is_obsolete) || st === 'CANCELLED';
      return isEff && !isSup && !isObs;
    });

    // Deduplicate by document code: keep ONLY the single highest active revision
    const codeMap = new Map();
    candidates.forEach(doc => {
      const code = (doc.document_code || doc.doc_code || doc.code || doc.title || '').trim().toUpperCase();
      const existing = codeMap.get(code);
      if (!existing) {
        codeMap.set(code, doc);
      } else {
        const revExisting = parseInt(String(existing.rev || existing.revision || '0').replace(/\D/g, ''), 10) || 0;
        const revDoc = parseInt(String(doc.rev || doc.revision || '0').replace(/\D/g, ''), 10) || 0;
        if (revDoc > revExisting) {
          codeMap.set(code, doc);
        }
      }
    });

    return Array.from(codeMap.values());
  }, [baseFilteredDocs]);

  // 2. Grouped Superseded logic (1 Document Code = 1 Row)
  const groupedSupersededDocs = useMemo(() => {
    const activeDocIds = new Set(activeDocs.map(d => d.id));

    const supersededCandidates = baseFilteredDocs.filter(d => {
      const st = (d.status || '').toUpperCase();
      const isObs = st === 'OBSOLETE' || st === 'OBSOLETE_ARCHIVED' || Boolean(d.is_obsolete) || st === 'CANCELLED';
      if (isObs) return false;

      const isSup = st === 'SUPERSEDED' || st === 'SUPERSEDED_ARCHIVED' || Boolean(d.is_superseded);
      if (isSup) return true;

      // If active candidate but not selected as the single active revision, it is superseded
      if (!activeDocIds.has(d.id)) {
        const isEff = st === 'EFFECTIVE' || st === 'ACTIVE' || st === 'APPROVED' || st === 'PUBLISHED' || Boolean(d.is_active);
        if (isEff) return true;
      }
      return false;
    });

    const groupMap = new Map();
    supersededCandidates.forEach(doc => {
      const docCode = (doc.code || doc.document_code || doc.doc_code || doc.title || '').trim().toUpperCase();
      if (!groupMap.has(docCode)) {
        groupMap.set(docCode, {
          ...doc,
          code: docCode,
          id: `grouped_${docCode}`,
          revisions: [],
        });
      }
      groupMap.get(docCode).revisions.push({
        ...doc,
        revision: String(doc.rev || doc.revision || '00').padStart(2, '0')
      });
    });

    // A code whose master is no longer active (e.g. made OBSOLETE) belongs to the Obsolete tab only.
    const activeCodes = new Set(activeDocs.map(d => (d.code || d.document_code || d.doc_code || d.title || '').trim().toUpperCase()));
    return Array.from(groupMap.values()).filter(group => activeCodes.has(group.code)).map(group => {
      // In SUPERSEDED view, ensure no active revision slips into superseded list
      group.revisions = group.revisions.filter(r => !activeDocIds.has(r.id));
      group.revisions.sort((a, b) => 
        String(b.rev || b.revision || '00').localeCompare(String(a.rev || a.revision || '00'), undefined, { numeric: true })
      );
      group.latestSupersededRev = group.revisions[0]?.rev || group.revisions[0]?.revision || '00';
      group.totalRevisions = group.revisions.length;
      group.pendingRecalls = group.revisions.filter(r => r.recallStatus && r.recallStatus !== 'COMPLETED');
      group.hasPendingRecall = group.pendingRecalls.length > 0;
      return group;
    });
  }, [baseFilteredDocs, activeDocs]);

  // 3. Obsolete Documents
  const obsoleteDocs = useMemo(() => {
    const list = baseFilteredDocs.filter(d => {
      const st = (d.status || '').toUpperCase();
      return st === 'OBSOLETE' || st === 'OBSOLETE_ARCHIVED' || Boolean(d.is_obsolete) || st === 'CANCELLED';
    });

    return [...list].sort((a, b) => {
      const codeA = (a.document_code || a.doc_code || a.code || a.title || '').trim().toUpperCase();
      const codeB = (b.document_code || b.doc_code || b.code || b.title || '').trim().toUpperCase();
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      const revA = parseInt(String(a.rev || a.revision || '0').replace(/\D/g, ''), 10) || 0;
      const revB = parseInt(String(b.rev || b.revision || '0').replace(/\D/g, ''), 10) || 0;
      return revB - revA;
    });
  }, [baseFilteredDocs]);

  // Discrete Tab Counts
  const activeCount = activeDocs.length;
  const supersededCount = groupedSupersededDocs.length;
  const obsoleteCount = obsoleteDocs.length;

  // Active display list
  const displayList = useMemo(() => {
    if (masterListStatus === 'SUPERSEDED') return groupedSupersededDocs;
    if (masterListStatus === 'OBSOLETE') return obsoleteDocs;
    return activeDocs;
  }, [masterListStatus, activeDocs, groupedSupersededDocs, obsoleteDocs]);

  const filteredDocs = displayList;

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedData,
    totalItems
  } = useTablePagination(displayList, 10);

  const handleExportExcel = () => {
    if (filteredDocs.length === 0) {
      alert('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }

    const headers = ['No.', 'Document No.', 'Document Title', 'Document Type', 'Revision No.', 'Effective Date', 'Requester', 'Reviewer', 'Approver', 'Ack', 'Distribution List', 'Status'];
    
    const rows = filteredDocs.map((doc, index) => {
      const docType = (doc.title || '').split('-')[0] || 'Unknown';
      const distribution = (doc.distributedTo || []).join(' | ');
      
      const dar = (dars || []).find(d => d.id === doc.darId);
      const reqName = dar ? getRequesterName(dar, masterUsers) : '-';
      const revName = dar ? getReviewerName(dar, timeline) : '-';
      const appName = dar ? getApproverName(dar, timeline) : '-';
      const ackName = dar ? getAckNames(dar, timeline) : '-';

      return [
        index + 1,
        `"${doc.title || ''}"`,
        `"${doc.name || ''}"`,
        docType,
        doc.rev || '00',
        doc.effectiveDate || '',
        `"${reqName}"`, 
        `"${revName}"`, 
        `"${appName}"`,
        `"${ackName}"`,
        `"${distribution}"`,
        doc.status || 'EFFECTIVE'
      ].join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(',') + "\n" + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `QMS_MasterList_${masterListDept || 'ALL'}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status) => {
    if (status === 'EFFECTIVE' || status === 'ACTIVE') return <span className="badge-active">มีผลบังคับใช้</span>;
    if (status === 'SUPERSEDED' || status === 'SUPERSEDED_ARCHIVED') return <span className="badge-pending">ฉบับตกรุ่น (Superseded)</span>;
    if (status === 'OBSOLETE_ARCHIVED' || status === 'OBSOLETE' || status === 'CANCELLED') return <span className="badge-draft">ยกเลิกถาวร (Obsolete)</span>;
    return <span className="badge-draft">{status}</span>;
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-full flex flex-col min-h-0 pb-6 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="card-surface p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#1E1E1E] flex items-center gap-2.5 tracking-tight">
            <Database className="text-[#0D99FF]" size={28} /> ทะเบียนเอกสารควบคุมหลัก (Master List Registry)
          </h2>
          <p className="text-sm text-[#666666] mt-1">ระบบคลังข้อมูลส่วนกลางสำหรับตรวจสอบและส่งออกทะเบียนเอกสาร QMS</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 3 Scope Tabs: Minimal Segmented Pills */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-lg overflow-x-auto shrink-0 text-xs">
            {/* Tab 1: เอกสารทั่วไป */}
            <button
              type="button"
              title="เอกสารส่วนกลาง / เอกสารทั่วไปของแผนกอื่น"
              aria-label="เอกสารทั่วไป (เอกสารส่วนกลาง / เอกสารทั่วไปของแผนกอื่น)"
              onClick={() => setSelectedScope(selectedScope === 'GENERAL' || selectedScope === 'PUBLIC' ? 'ALL' : 'GENERAL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                selectedScope === 'GENERAL' || selectedScope === 'PUBLIC'
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
              }`}
            >
              <Globe size={13} className={selectedScope === 'GENERAL' || selectedScope === 'PUBLIC' ? 'text-blue-600' : 'text-slate-400'} />
              <span>เอกสารทั่วไป</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                selectedScope === 'GENERAL' || selectedScope === 'PUBLIC'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                  : 'bg-slate-200/80 text-slate-600'
              }`}>
                {generalCount}
              </span>
            </button>

            {/* Tab 2: ในแผนกฉัน */}
            <button
              type="button"
              aria-label="ในแผนกฉัน"
              title="เฉพาะเอกสารที่แผนกฉันเป็นเจ้าของ"
              onClick={() => setSelectedScope(selectedScope === 'MY_DEPT' ? 'ALL' : 'MY_DEPT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                selectedScope === 'MY_DEPT'
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
              }`}
            >
              <Building2 size={13} className={selectedScope === 'MY_DEPT' ? 'text-blue-600' : 'text-slate-400'} />
              <span>ในแผนกฉัน</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                selectedScope === 'MY_DEPT'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                  : 'bg-slate-200/80 text-slate-600'
              }`}>
                {myDeptCount}
              </span>
            </button>

            {/* Tab 3: เอกสารที่ได้รับการแจกจ่าย */}
            <button
              type="button"
              aria-label="เอกสารที่ได้รับการแจกจ่าย"
              title="เอกสารที่มีสำเนาแจกจ่ายมายังแผนกของฉัน"
              onClick={() => setSelectedScope(selectedScope === 'DISTRIBUTED' ? 'ALL' : 'DISTRIBUTED')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                selectedScope === 'DISTRIBUTED'
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
              }`}
            >
              <Share2 size={13} className={selectedScope === 'DISTRIBUTED' ? 'text-blue-600' : 'text-slate-400'} />
              <span>ที่ได้รับการแจกจ่าย</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                selectedScope === 'DISTRIBUTED'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                  : 'bg-slate-200/80 text-slate-600'
              }`}>
                {distributedCount}
              </span>
            </button>
          </div>

          <div className="bg-[#E5F4FF] px-4 py-2.5 rounded-xl border border-[#E5F4FF]/80 flex items-center gap-3">
            <span className="text-[#007BE5] font-bold text-sm">เอกสารทั้งหมด (ตามเงื่อนไข):</span>
            <span className="text-2xl font-bold text-indigo-900 font-mono">{filteredDocs.length}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar Container - สะอาด รองรับ Responsive 100% ไม่ตกขอบ */}
      <div className="card-surface p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs shrink-0 overflow-hidden space-y-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full">
          
          {/* 1. ช่องค้นหาหลัก (ยืดหยุ่นตามพื้นที่) */}
          <div className="relative flex-1 min-w-[200px] sm:min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหารหัส หรือชื่อเอกสาร..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-xs"
            />
          </div>

          {/* 2. Dropdown ตัวกรอง 4 ตัว (ขนาดกะทัดรัด เป็นระเบียบ) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* แผนก */}
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-auto sm:w-[130px] xl:w-[140px] py-2 px-2.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer shadow-xs truncate"
            >
              <option value="ALL">ทุกแผนก (All)</option>
              {departments.map((dept) => {
                const matchedDept = (masterDepartments || []).find(md => md.id === dept);
                const label = matchedDept ? `${dept} - ${matchedDept.nameTh || matchedDept.name}` : dept;
                return <option key={dept} value={dept}>{label}</option>;
              })}
            </select>

            {/* ประเภทเอกสาร */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-auto sm:w-[130px] xl:w-[140px] py-2 px-2.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer shadow-xs truncate"
            >
              <option value="ALL">ทุกประเภท (Types)</option>
              {docTypes.map((type) => {
                const matchedType = (documentTypes || []).find(dt => (dt.code || dt.id) === type);
                const rawName = (matchedType?.nameTh || matchedType?.name || '').replace(/\s*\([^)]*\)/g, '').trim();
                const label = matchedType ? `${rawName || matchedType.nameTh || matchedType.name} (${type})` : type;
                return <option key={type} value={type}>{label}</option>;
              })}
            </select>

            {/* มาตรฐาน */}
            <select
              value={selectedStandard}
              onChange={(e) => setSelectedStandard(e.target.value)}
              className="w-auto sm:w-[125px] xl:w-[135px] py-2 px-2.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer shadow-xs truncate"
            >
              <option value="ALL">ทุกมาตรฐาน</option>
              {standards.map((std) => (
                <option key={std} value={std}>{std}</option>
              ))}
            </select>

            {/* ระดับความลับ */}
            <select
              value={selectedSecurity}
              onChange={(e) => setSelectedSecurity(e.target.value)}
              className="w-auto sm:w-[125px] xl:w-[135px] py-2 px-2.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer shadow-xs truncate"
            >
              <option value="ALL">ทุกระดับความลับ</option>
              <option value="PUBLIC">ทั่วไป (General)</option>
              <option value="CONFIDENTIAL">ลับ (Confidential)</option>
            </select>
          </div>

          {/* 3. ปุ่ม Toggle เฉพาะฉบับบังคับใช้ (ไม่โดนบีบย่น ไม่หลุดกรอบ) */}
          <button
            type="button"
            onClick={() => setMasterListStatus('ACTIVE')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border shadow-xs ml-auto sm:ml-0 ${
              masterListStatus === 'ACTIVE'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/70'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className={`w-3.5 h-3.5 ${masterListStatus === 'ACTIVE' ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>เฉพาะฉบับบังคับใช้</span>
          </button>

          {/* Actions: Reset & Export */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {(selectedScope !== 'ALL' || selectedDept !== 'ALL' || selectedType !== 'ALL' || selectedStandard !== 'ALL' || selectedSecurity !== 'ALL' || searchTerm || masterListStatus !== 'ACTIVE') && (
              <button 
                type="button"
                onClick={() => {
                  setSelectedScope('ALL');
                  setSelectedDept('ALL');
                  setSelectedType('ALL');
                  setSelectedStandard('ALL');
                  setSelectedSecurity('ALL');
                  setSearchTerm('');
                  setMasterListStatus('ACTIVE');
                }}
                title="ล้างตัวกรอง"
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-xl border border-rose-200 transition-all cursor-pointer shrink-0"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>ล้างตัวกรอง</span>
              </button>
            )}

            <button 
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ส่งออก Excel</span>
            </button>
          </div>

        </div>

        {/* Status Sub-Bar: 3 สถานะหลักที่แยกจากกันเด็ดขาด (No All Records Tab) */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
            <button
              type="button"
              aria-label="มีผลบังคับใช้ (Active)"
              onClick={() => setMasterListStatus('ACTIVE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                masterListStatus === 'ACTIVE'
                  ? 'bg-white text-emerald-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>มีผลบังคับใช้ (Active)</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                {activeCount}
              </span>
            </button>

            <button
              type="button"
              aria-label="ฉบับตกรุ่น (Superseded)"
              onClick={() => setMasterListStatus('SUPERSEDED')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                masterListStatus === 'SUPERSEDED'
                  ? 'bg-white text-amber-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>ฉบับตกรุ่น (Superseded)</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                {supersededCount}
              </span>
            </button>

            <button
              type="button"
              aria-label="ยกเลิกถาวร (Obsolete)"
              onClick={() => setMasterListStatus('OBSOLETE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                masterListStatus === 'OBSOLETE'
                  ? 'bg-white text-rose-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>ยกเลิกถาวร (Obsolete)</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                {obsoleteCount}
              </span>
            </button>
          </div>

          <div className="text-slate-500 font-mono text-xs">
            แสดงผล <strong className="text-slate-800 font-bold">{paginatedData.length}</strong> จาก {displayList.length} รายการ
          </div>
        </div>
      </div>

      {/* Data Table Container */}
      <div className="w-full max-w-full flex-1 flex flex-col min-h-0 bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 scrollbar-thin">
          {paginatedData.length > 0 ? (
            <table className="w-full text-left text-sm table-auto min-w-[1150px] border-collapse">
              <thead className="bg-[#F8FAFC] text-slate-700 font-bold text-xs sm:text-sm uppercase tracking-normal border-b border-[#E2E8F0] sticky top-0 z-10 whitespace-nowrap shadow-xs backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3.5 w-14 text-center font-mono whitespace-nowrap bg-[#F8FAFC]">ลำดับ</th>
                  <th className="px-4 py-3.5 w-36 font-mono whitespace-nowrap bg-[#F8FAFC]">รหัสเอกสาร</th>
                  <th className="px-4 py-3.5 min-w-[280px] max-w-[420px] whitespace-nowrap bg-[#F8FAFC]">ชื่อเอกสาร</th>
                  <th className="px-4 py-3.5 w-20 text-center whitespace-nowrap bg-[#F8FAFC]">ประเภท</th>
                  {masterListStatus === 'SUPERSEDED' ? (
                    <th className="px-4 py-3.5 w-48 whitespace-nowrap bg-[#F8FAFC]">ฉบับและวันบังคับใช้เดิม</th>
                  ) : (
                    <>
                      <th className="px-4 py-3.5 w-16 text-center whitespace-nowrap bg-[#F8FAFC]">ฉบับที่</th>
                      <th className="px-4 py-3.5 w-28 font-mono whitespace-nowrap bg-[#F8FAFC]">วันบังคับใช้</th>
                    </>
                  )}
                  <th className="px-4 py-3.5 w-36 whitespace-nowrap bg-[#F8FAFC]">ผู้ร้องขอ</th>
                  <th className="px-4 py-3.5 w-36 whitespace-nowrap bg-[#F8FAFC]">ผู้ทบทวน</th>
                  <th className="px-4 py-3.5 w-36 whitespace-nowrap bg-[#F8FAFC]">ผู้อนุมัติ</th>
                  <th className="px-4 py-3.5 w-36 whitespace-nowrap bg-[#F8FAFC]">การแจกจ่าย</th>
                  <th className="px-4 py-3.5 w-28 text-center whitespace-nowrap bg-[#F8FAFC]">สถานะ</th>
                  <th className="px-4 py-3.5 min-w-[200px] text-center whitespace-nowrap bg-[#F8FAFC]">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {paginatedData.map((doc, idx) => {
                  const dar = (dars || []).find(d => d.id === doc.darId);
                  const docCode = doc.code || doc.document_code || doc.docNo || doc.title;
                  const activeDar = getActiveDarForDocument(dars, docCode);
                  const isLocked = Boolean(activeDar);
                  
                  return (
                  <tr key={doc.id} className="hover:bg-[#F8FAFC]/80 transition-colors">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono text-xs sm:text-sm whitespace-nowrap">{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#0D99FF] text-sm sm:text-[15px] whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{doc.title || doc.code}</span>
                        {isLocked && (
                          <span 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
                            title={`อยู่ระหว่างขั้นตอน: ${activeDar.dar_no || activeDar.darNo || activeDar.id} (${activeDar.type || 'DAR'})`}
                          >
                            <Lock className="w-3 h-3 text-amber-600 shrink-0"/>
                            <span>🔒 ติดคำร้อง {activeDar.dar_no || activeDar.darNo || activeDar.id}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 min-w-[280px] max-w-[420px]">
                      <span className="font-medium text-[#1E1E1E] text-sm sm:text-[15px] leading-relaxed block" title={doc.name}>
                        {doc.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="px-2.5 py-1 bg-[#F5F5F5] text-slate-700 rounded-lg font-mono text-xs font-bold">
                        {(doc.title || '').split('-')[0]}
                      </span>
                    </td>
                    {masterListStatus === 'SUPERSEDED' ? (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs font-semibold text-slate-700">
                          {doc.revisions && doc.revisions.length > 1
                            ? `Rev.${doc.revisions[doc.revisions.length - 1].revision || doc.revisions[doc.revisions.length - 1].rev} – Rev.${doc.revisions[0].revision || doc.revisions[0].rev}`
                            : `Rev.${doc.revisions?.[0]?.revision || doc.revisions?.[0]?.rev || '00'}`}
                          <span className="text-slate-400 font-normal ml-1.5">
                            ({doc.revisions?.length || 1} ฉบับเดิม)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          ตกรุ่นเมื่อ: {doc.revisions?.[0]?.effectiveDate || doc.revisions?.[0]?.supersededAt || '-'}
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-700 text-xs sm:text-sm">
                            {doc.rev || '00'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600 text-xs sm:text-sm whitespace-nowrap">
                          {doc.effectiveDate || '-'}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-slate-600 text-xs sm:text-sm truncate max-w-[150px] whitespace-nowrap" title={dar ? getRequesterName(dar, masterUsers) : '-'}>
                      {dar ? getRequesterName(dar, masterUsers) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs sm:text-sm truncate max-w-[150px] whitespace-nowrap" title={dar ? getReviewerName(dar, timeline) : '-'}>
                      {dar ? getReviewerName(dar, timeline) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs sm:text-sm truncate max-w-[150px] whitespace-nowrap" title={dar ? getApproverName(dar, timeline) : '-'}>
                      {dar ? getApproverName(dar, timeline) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs sm:text-sm truncate max-w-[150px] whitespace-nowrap" title={(doc.distributedTo || []).join(', ')}>
                      {(doc.distributedTo || []).join(', ') || '-'}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center gap-1">
                        {masterListStatus === 'SUPERSEDED' ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            ฉบับตกรุ่น ({doc.totalRevisions || (doc.revisions || []).length} ฉบับ)
                          </span>
                        ) : (
                          getStatusBadge(doc.status)
                        )}
                        {isLocked && (
                          <span 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
                            title={`อยู่ระหว่างขั้นตอน: ${activeDar.dar_no || activeDar.darNo || activeDar.id} (${activeDar.type || 'DAR'})`}
                          >
                            <Lock className="w-3 h-3 text-amber-600 shrink-0"/>
                            <span>🔒 ติดคำร้อง {activeDar.dar_no || activeDar.darNo || activeDar.id}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button 
                          onClick={() => setPreviewDoc(doc)}
                          className="action-icon-btn text-[#0D99FF] hover:bg-[#E5F4FF] cursor-pointer"
                          title="ดูรายละเอียดเอกสาร"
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          onClick={() => handleDownloadDoc(doc, 'UNCONTROLLED')}
                          className="action-icon-btn text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                          title="ดาวน์โหลดสำเนาไม่ควบคุม (Uncontrolled Copy)"
                        >
                          <Download size={14} />
                        </button>
                        {masterListStatus !== 'SUPERSEDED' && (
                          <DropdownMenu>
                            {/* ปุ่มขอแก้ไข */}
                            <DropdownMenuItem 
                              disabled={isLocked} 
                              onClick={() => handleOpenRevision(doc)}
                              title={isLocked ? `เอกสารนี้อยู่ระหว่างดำเนินการในคำร้อง ${activeDar.dar_no || activeDar.darNo || activeDar.id} (${activeDar.type || 'DAR'}) - ติดคำร้อง ${activeDar.dar_no || activeDar.darNo || activeDar.id}` : ''}
                              className={isLocked ? 'text-slate-400' : 'text-amber-700 hover:bg-amber-50 border-amber-200'}
                            >
                              {isLocked && <Lock className="w-3 h-3 text-amber-600 shrink-0 inline mr-0.5" />}
                              <span>ขอแก้ไขเอกสาร (Revise)</span>
                            </DropdownMenuItem>

                            {/* ปุ่มขอยกเลิก */}
                            <DropdownMenuItem 
                              disabled={isLocked} 
                              onClick={() => handleOpenObsolete(doc)}
                              title={isLocked ? `เอกสารนี้อยู่ระหว่างดำเนินการในคำร้อง ${activeDar.dar_no || activeDar.darNo || activeDar.id} (${activeDar.type || 'DAR'}) - ติดคำร้อง ${activeDar.dar_no || activeDar.darNo || activeDar.id}` : ''}
                              className={isLocked ? 'text-slate-400' : 'text-rose-600 hover:bg-rose-50 border-rose-200'}
                            >
                              {isLocked && <Lock className="w-3 h-3 text-amber-600 shrink-0 inline mr-0.5" />}
                              <span>ขอยกเลิกเอกสาร (Obsolete)</span>
                            </DropdownMenuItem>
                          </DropdownMenu>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}

              </tbody>
            </table>
          ) : (
            <div className="p-8 flex items-center justify-center">
              <EmptyState />
            </div>
          )}
        </div>
        <TablePagination
          currentPage={currentPage}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Preview Dialog */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
              <div>
                <span className="font-mono text-xs font-bold text-blue-600">{previewDoc.title}</span>
                <h3 className="text-sm font-bold text-slate-900 mt-0.5">{previewDoc.name}</h3>
              </div>
              <button 
                type="button"
                onClick={() => setPreviewDoc(null)} 
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">แผนกเจ้าของ:</span>
                <span className="font-bold text-slate-800">{previewDoc.department}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Revision:</span>
                <span className="font-bold font-mono text-slate-800">{previewDoc.rev || '00'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">วันบังคับใช้:</span>
                <span className="font-bold font-mono text-slate-800">{previewDoc.effectiveDate}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">สถานะ:</span>
                <span>{getStatusBadge(previewDoc.status)}</span>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
              {isDccAdmin ? (
                <div className="relative inline-block text-left" ref={previewMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsPreviewMenuOpen(prev => !prev)}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    title="เลือกรูปแบบการดาวน์โหลด (DCC Admin)"
                  >
                    <Download size={14} />
                    <span>ดาวน์โหลด PDF</span>
                    <ChevronDown size={14} className={`opacity-80 transition-transform ${isPreviewMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isPreviewMenuOpen && (
                    <div className="absolute left-0 bottom-full mb-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPreviewMenuOpen(false);
                          handleDownloadDoc(previewDoc, 'UNCONTROLLED');
                        }}
                        className="w-full text-left px-3 py-2 text-xs rounded-lg text-slate-700 hover:bg-slate-100 flex flex-col transition-colors cursor-pointer"
                      >
                        <span className="font-semibold text-slate-900 flex items-center gap-1">
                          📄 สำเนาไม่ควบคุม (Uncontrolled Copy)
                        </span>
                        <span className="text-[11px] text-slate-500 mt-0.5">ติดลายน้ำสีแดง สำหรับดูอ้างอิง</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsPreviewMenuOpen(false);
                          handleDownloadDoc(previewDoc, 'CLEAN');
                        }}
                        className="w-full text-left px-3 py-2 text-xs rounded-lg text-blue-700 bg-blue-50/80 hover:bg-blue-100 flex flex-col mt-1 border-t border-slate-100 transition-colors cursor-pointer"
                      >
                        <span className="font-semibold text-blue-600 flex items-center gap-1">
                          📥 เอกสารแม่บทฉบับคลีน (Clean Master)
                        </span>
                        <span className="text-[11px] text-slate-500 mt-0.5">ไม่มีลายน้ำ มีเฉพาะตารางลายเซ็น 3x3</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsPreviewMenuOpen(false);
                          handleDownloadDoc(previewDoc, 'CONTROLLED');
                        }}
                        className="w-full text-left px-3 py-2 text-xs rounded-lg text-emerald-700 hover:bg-emerald-50 flex flex-col mt-1 border-t border-slate-100 transition-colors cursor-pointer"
                      >
                        <span className="font-semibold text-emerald-600 flex items-center gap-1">
                          📑 สำเนาควบคุม (Controlled Copy)
                        </span>
                        <span className="text-[11px] text-slate-500 mt-0.5">ติดลายน้ำสีน้ำเงิน สำหรับหน้างาน</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDownloadDoc(previewDoc, 'UNCONTROLLED')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  title="ดาวน์โหลดสำเนาไม่ควบคุม (Uncontrolled Copy)"
                >
                  <Download size={14} />
                  <span>ดาวน์โหลด (สำเนาไม่ควบคุม)</span>
                </button>
              )}

              <button 
                type="button"
                onClick={() => {
                  setPreviewDoc(null);
                  setIsPreviewMenuOpen(false);
                }} 
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterList;
