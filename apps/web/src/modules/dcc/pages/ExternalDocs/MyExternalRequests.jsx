import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { 
  FileText, 
  ArrowLeft, 
  Plus, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Search, 
  FilterX, 
  Eye, 
  Edit3, 
  RotateCcw, 
  ChevronRight,
  ShieldCheck,
  X
} from 'lucide-react';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import ExternalDocFormModal from './ExternalDocFormModal';
import ExternalDocPreviewModal from './ExternalDocPreviewModal';

const STATUS_FILTERS = [
  { id: 'ALL', label: 'ทั้งหมด' },
  { id: 'PENDING_EXT_REVIEW', label: 'รอทบทวน', eng: 'Pending Review' },
  { id: 'PENDING_EXT_APPROVAL', label: 'รออนุมัติ', eng: 'Pending Approval' },
  { id: 'REVISE_REQUESTED', label: 'รอฉันแก้ไข', eng: 'Revise Requested' },
  { id: 'APPROVED', label: 'อนุมัติแล้ว', eng: 'Approved' },
  { id: 'REJECTED', label: 'ไม่อนุมัติ', eng: 'Rejected' },
];

const MyExternalRequests = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryId = searchParams.get('id');

  useEffect(() => {
    if (queryId) {
      navigate(`/dcc/external/requests/${queryId}`, { replace: true });
    }
  }, [queryId, navigate]);

  const { 
    currentUser, 
    externalRequests, 
    externalDocuments, 
    tasks 
  } = useStore();

  const [activeStatus, setActiveStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [docToEdit, setDocToEdit] = useState(null);
  const [resubmitTaskId, setResubmitTaskId] = useState(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedDocForPreview, setSelectedDocForPreview] = useState(null);

  const currentUserId = currentUser?.id;

  // Aggregate user's external requests with fallbacks for seamless parity
  const allMyRequests = useMemo(() => {
    const requestsMap = new Map();

    // 1. Existing externalRequests in store
    (externalRequests || []).forEach(r => {
      const isMine = r.requesterId === currentUserId || 
                     r.userId === currentUserId ||
                     (r.requesterName && currentUser?.name && r.requesterName.includes(currentUser.name));
      if (isMine) {
        const key = r.requestId || r.requestNo || r.id;
        requestsMap.set(key, {
          ...r,
          id: r.id || key,
          requestId: r.requestId || r.requestNo || key,
          requestNo: r.requestNo || r.requestId || key,
          edCode: r.edCode || r.documentCode || r.doc_code || r.docCode,
          documentCode: r.documentCode || r.edCode || r.doc_code || r.docCode,
          docCode: r.docCode || r.documentCode || r.edCode,
          docId: r.docId || r.documentId || r.externalDocId,
          documentId: r.documentId || r.docId || r.externalDocId
        });
      }
    });

    // 2. Fallback: Include docs owned by user from externalDocuments if not already registered in externalRequests
    (externalDocuments || []).forEach(doc => {
      const isOwner = doc.ownerId === currentUserId || doc.requesterId === currentUserId || (!doc.ownerId && !doc.requesterId);
      if (isOwner) {
        const docCode = doc.edCode || doc.doc_code || doc.docNo || doc.id;
        const matchingExisting = Array.from(requestsMap.values()).find(
          r => r.docId === doc.id || r.documentId === doc.id || r.externalDocId === doc.id || 
               (r.edCode && (r.edCode === docCode || r.edCode === doc.id)) ||
               (r.documentCode && (r.documentCode === docCode || r.documentCode === doc.id))
        );

        if (!matchingExisting) {
          const reqId = doc.requestNo || doc.requestId || (String(doc.id).startsWith('EDR-') ? doc.id : `EDR-${docCode}`);
          const nowIso = doc.createdAt || new Date().toISOString();
          requestsMap.set(reqId, {
            id: reqId,
            requestId: reqId,
            requestNo: reqId,
            docId: doc.id,
            documentId: doc.id,
            externalDocId: doc.id,
            edCode: docCode,
            doc_code: docCode,
            docCode: docCode,
            documentCode: docCode,
            title: doc.title,
            requestType: doc.status === 'OBSOLETE' ? 'OBSOLETE' : 'NEW',
            department: doc.department || doc.dept || 'QA',
            requesterId: doc.ownerId || currentUserId,
            requesterName: doc.ownerName || currentUser?.name || 'Requester',
            requesterRole: currentUser?.position || 'Requester',
            reviewerId: doc.reviewerId,
            reviewerName: doc.reviewerName || '-',
            reviewerRole: 'Reviewer',
            approverId: doc.approverId,
            approverName: doc.approverName || '-',
            approverRole: 'Approver',
            status: doc.status || 'ACTIVE',
            returnReason: doc.returnReason || null,
            revisionComment: doc.revisionComment || null,
            createdAt: nowIso,
            updatedAt: doc.updatedAt || nowIso,
            signoffs: [
              {
                step: 'REQUEST',
                stepName: 'ยื่นคำร้อง',
                role: 'ผู้ยื่นคำร้อง',
                userName: doc.ownerName || currentUser?.name || 'Requester',
                userRole: currentUser?.position || 'Requester',
                status: 'COMPLETED',
                date: nowIso,
                comment: 'ยื่นคำร้องขึ้นทะเบียนเอกสารภายนอก'
              },
              {
                step: 'REVIEW',
                stepName: 'ทบทวนเอกสาร',
                role: 'ผู้ทบทวน',
                userName: doc.reviewerName || '-',
                userRole: 'Reviewer',
                status: doc.status === 'PENDING_EXT_REVIEW' ? 'PENDING' : (doc.status === 'REVISE_REQUESTED' ? 'RETURNED' : 'COMPLETED'),
                date: doc.reviewedAt || null,
                comment: doc.revisionComment || null
              },
              {
                step: 'APPROVE',
                stepName: 'อนุมัติเอกสาร',
                role: 'ผู้อนุมัติ',
                userName: doc.approverName || '-',
                userRole: 'Approver',
                status: doc.status === 'PENDING_EXT_APPROVAL' ? 'PENDING' : (['ACTIVE', 'EFFECTIVE'].includes(doc.status) ? 'COMPLETED' : 'WAITING'),
                date: doc.approvedAt || null,
                comment: null
              }
            ]
          });
        }
      }
    });

    return Array.from(requestsMap.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [externalRequests, externalDocuments, currentUserId, currentUser?.name, currentUser?.position]);

  // Status Counts for Filter Tabs
  const statusCounts = useMemo(() => {
    const counts = {
      ALL: allMyRequests.length,
      PENDING_EXT_REVIEW: 0,
      PENDING_EXT_APPROVAL: 0,
      REVISE_REQUESTED: 0,
      APPROVED: 0,
      REJECTED: 0
    };

    allMyRequests.forEach(r => {
      const status = r.status;
      if (status === 'PENDING_EXT_REVIEW') {
        counts.PENDING_EXT_REVIEW++;
      } else if (status === 'PENDING_EXT_APPROVAL') {
        counts.PENDING_EXT_APPROVAL++;
      } else if (status === 'REVISE_REQUESTED') {
        counts.REVISE_REQUESTED++;
      } else if (status === 'APPROVED' || status === 'ACTIVE' || status === 'EFFECTIVE') {
        counts.APPROVED++;
      } else if (status === 'REJECTED') {
        counts.REJECTED++;
      }
    });

    return counts;
  }, [allMyRequests]);

  // Filtered requests based on active tab and search input
  const filteredRequests = useMemo(() => {
    return allMyRequests.filter(r => {
      // 1. Status Filter
      if (activeStatus !== 'ALL') {
        if (activeStatus === 'APPROVED') {
          if (!['APPROVED', 'ACTIVE', 'EFFECTIVE'].includes(r.status)) return false;
        } else if (r.status !== activeStatus) {
          return false;
        }
      }

      // 2. Search Query (EDR No., ED Code, Title, Dept, Source, People)
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const reqId = (r.requestId || r.id || '').toLowerCase();
        const code = (r.edCode || r.doc_code || '').toLowerCase();
        const title = (r.title || '').toLowerCase();
        const dept = (r.department || '').toLowerCase();
        const source = (r.source || '').toLowerCase();
        const requester = (r.requesterName || '').toLowerCase();
        const reviewer = (r.reviewerName || '').toLowerCase();
        const approver = (r.approverName || '').toLowerCase();

        return reqId.includes(q) || 
               code.includes(q) || 
               title.includes(q) || 
               dept.includes(q) || 
               source.includes(q) || 
               requester.includes(q) || 
               reviewer.includes(q) || 
               approver.includes(q);
      }

      return true;
    });
  }, [allMyRequests, activeStatus, searchTerm]);

  // Pagination hook
  const pagination = useTablePagination(filteredRequests, 10);

  // Helper: Find matching externalDocument object for a request
  const findMatchingDoc = (req) => {
    const found = (externalDocuments || []).find(d => 
      d.id === req.docId || 
      d.id === req.externalDocId || 
      (req.edCode && (d.edCode === req.edCode || d.doc_code === req.edCode || d.id === req.edCode))
    );

    const base = found ? { ...found } : {
      id: req.docId || req.id,
      edCode: req.edCode || req.doc_code || 'ED-DOC',
      title: req.title,
      department: req.department || 'QA',
      status: req.status,
      returnReason: req.returnReason,
      revisionComment: req.revisionComment,
      source: req.source || 'Official Standard',
      sourceVersion: req.sourceVersion || '-'
    };

    const attachedFile = req.attachedFile || base.attachedFile || null;
    const fileId = req.fileId || base.fileId || attachedFile?.fileId || null;
    const fileName = req.fileName || base.fileName || attachedFile?.name || '';

    return {
      ...base,
      requestId: req.requestId || req.id,
      ...(attachedFile ? { attachedFile, file: attachedFile, attachment: attachedFile } : {}),
      ...(req.apiFilePath ? { apiFilePath: req.apiFilePath } : {}),
      ...(fileId ? { fileId } : {}),
      ...(fileName ? { fileName } : {})
    };
  };

  // Helper: Find resubmit task if available
  const findResubmitTask = (req) => {
    return (tasks || []).find(t => 
      (t.type === 'EXTERNAL_REVISE' || t.taskType === 'EXTERNAL_REVISE') &&
      (t.referenceId === req.docId || t.docId === req.docId || t.docCode === req.edCode || t.referenceId === req.externalDocId) &&
      (t.assigneeId === currentUserId || t.requesterId === currentUserId) &&
      t.status === 'PENDING'
    ) || null;
  };

  // Action: Open Edit / Resubmit Modal
  const handleOpenResubmit = (req, e) => {
    if (e) e.stopPropagation();
    const doc = findMatchingDoc(req);
    const task = findResubmitTask(req);
    setDocToEdit(doc);
    setResubmitTaskId(task?.id || null);
    setIsFormOpen(true);
  };

  // Action: Open PDF Preview
  const handleOpenPreview = (req, e) => {
    if (e) e.stopPropagation();
    const doc = findMatchingDoc(req);
    setSelectedDocForPreview(doc);
    setIsPreviewOpen(true);
  };

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Render Request Type Badge
  const renderTypeBadge = (type) => {
    switch (type) {
      case 'REVISION':
      case 'UPDATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
            <RotateCcw size={12} className="shrink-0" />
            <span>ขอปรับปรุงฉบับ</span>
          </span>
        );
      case 'OBSOLETE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
            <XCircle size={12} className="shrink-0" />
            <span>ขอยกเลิก</span>
          </span>
        );
      case 'NEW':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
            <Plus size={12} className="shrink-0" />
            <span>ขอขึ้นทะเบียนใหม่</span>
          </span>
        );
    }
  };

  // Render Status Badge
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'PENDING_EXT_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300 shadow-2xs whitespace-nowrap">
            <Clock size={12} className="shrink-0 animate-pulse text-amber-600" />
            <span>รอทบทวน</span>
          </span>
        );
      case 'PENDING_EXT_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-300 shadow-2xs whitespace-nowrap">
            <ShieldCheck size={12} className="shrink-0 text-indigo-600" />
            <span>รออนุมัติ</span>
          </span>
        );
      case 'REVISE_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-400 shadow-2xs animate-pulse whitespace-nowrap">
            <AlertCircle size={12} className="shrink-0 text-orange-600" />
            <span>รอฉันแก้ไข</span>
          </span>
        );
      case 'APPROVED':
      case 'ACTIVE':
      case 'EFFECTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs whitespace-nowrap">
            <CheckCircle2 size={12} className="shrink-0 text-emerald-600" />
            <span>อนุมัติแล้ว</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs whitespace-nowrap">
            <XCircle size={12} className="shrink-0 text-rose-600" />
            <span>ไม่อนุมัติ</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
            {status || 'กำลังดำเนินการ'}
          </span>
        );
    }
  };

  // Helper: Get Current Handler Text and Role Icon
  const getCurrentHandler = (req) => {
    switch (req.status) {
      case 'PENDING_EXT_REVIEW':
        return (
          <span className="text-[#007BE5] font-medium flex items-center gap-1.5 text-xs sm:text-[13px] truncate" title={`รอคุณ${req.reviewerName || 'ผู้ทบทวน'} ทบทวน`}>
            <Clock size={13} className="text-amber-500 shrink-0 animate-pulse" />
            <span className="truncate">รอคุณ{req.reviewerName || 'ผู้ทบทวน'} ทบทวน</span>
          </span>
        );
      case 'PENDING_EXT_APPROVAL':
        return (
          <span className="text-indigo-600 font-medium flex items-center gap-1.5 text-xs sm:text-[13px] truncate" title={`รอคุณ${req.approverName || 'ผู้อนุมัติ'} อนุมัติ`}>
            <ShieldCheck size={13} className="text-indigo-500 shrink-0" />
            <span className="truncate">รอคุณ{req.approverName || 'ผู้อนุมัติ'} อนุมัติ</span>
          </span>
        );
      case 'REVISE_REQUESTED':
        return (
          <span className="text-orange-600 font-medium flex items-center gap-1.5 text-xs sm:text-[13px] truncate" title={`ส่งกลับให้คุณ${req.requesterName || 'ผู้ยื่นคำร้อง'} แก้ไข`}>
            <AlertCircle size={13} className="text-orange-500 shrink-0" />
            <span className="truncate">ส่งกลับให้คุณ{req.requesterName || 'ผู้ยื่นคำร้อง'} แก้ไข</span>
          </span>
        );
      case 'APPROVED':
      case 'ACTIVE':
      case 'EFFECTIVE':
        return (
          <span className="text-emerald-600 font-medium flex items-center gap-1.5 text-xs sm:text-[13px]">
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            <span>อนุมัติเรียบร้อยแล้ว</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="text-rose-600 font-medium flex items-center gap-1.5 text-xs sm:text-[13px]">
            <XCircle size={13} className="text-rose-500 shrink-0" />
            <span>ไม่อนุมัติคำร้อง</span>
          </span>
        );
      default:
        return <span className="text-slate-400 font-medium text-xs sm:text-[13px]">-</span>;
    }
  };

  return (
    <div className="w-full space-y-5 pb-16">
      {/* 1. Header Card with Nav Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <button
                type="button"
                onClick={() => navigate('/dcc/external-docs')}
                className="hover:text-blue-600 inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <ArrowLeft size={14} />
                <span>คลังเอกสารภายนอก</span>
              </button>
              <ChevronRight size={13} className="text-slate-300" />
              <span className="text-blue-600">คำร้องของฉัน</span>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0 border border-blue-100 shadow-2xs">
                <FileText size={20} />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                  <span>คำร้องเอกสารภายนอกของฉัน</span>
                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                    {allMyRequests.length} คำร้อง
                  </span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  ติดตามสถานะคำร้องขอขึ้นทะเบียน ขอปรับปรุงฉบับ และขอยกเลิกเอกสารภายนอกของคุณ
                </p>
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={() => navigate('/dcc/external-docs')}
              className="h-9.5 px-3.5 text-xs sm:text-sm font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 rounded-xl shadow-2xs inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <ArrowLeft size={15} />
              <span>กลับไปคลังเอกสารภายนอก</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDocToEdit(null);
                setResubmitTaskId(null);
                setIsFormOpen(true);
              }}
              className="h-9.5 px-4 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus size={16} strokeWidth={2.2} />
              <span>ลงทะเบียนเอกสารใหม่</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Filter Toolbar & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3.5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Status Tabs Navigation */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl overflow-x-auto scrollbar-hide shadow-2xs">
            {STATUS_FILTERS.map((tab) => {
              const count = statusCounts[tab.id] || 0;
              const isActive = activeStatus === tab.id;
              const isAlertTab = tab.id === 'REVISE_REQUESTED' && count > 0;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveStatus(tab.id);
                    pagination.setCurrentPage(1);
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? isAlertTab 
                        ? 'bg-orange-500 text-white shadow-xs'
                        : 'bg-white text-blue-700 border border-blue-200 shadow-2xs'
                      : isAlertTab
                        ? 'text-orange-700 bg-orange-50/70 hover:bg-orange-100/70 border border-orange-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[11px] font-mono font-bold ${
                      isActive
                        ? isAlertTab
                          ? 'bg-white/25 text-white'
                          : 'bg-blue-50 text-blue-700'
                        : isAlertTab
                          ? 'bg-orange-200 text-orange-900'
                          : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] lg:w-80 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} />
            <input
              type="text"
              placeholder="ค้นหารหัสคำร้อง, รหัส ED, ชื่อ, บุคคล..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                pagination.setCurrentPage(1);
              }}
              className="w-full h-9.5 text-xs sm:text-sm placeholder:text-slate-400 pl-9 pr-8 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  pagination.setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Enterprise Data Table (Full Width, DAR Parity) */}
      <div className="w-full bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-2xs flex flex-col min-h-0 h-auto">
        <div className="overflow-x-auto overflow-y-auto max-h-[640px] w-full max-w-full scrollbar-thin">
          <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
            <thead className="table-header sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0] shadow-xs backdrop-blur-sm whitespace-nowrap">
              <tr>
                <th className="px-3 py-3 w-20 min-w-[80px] text-center bg-[#F8FAFC] font-semibold text-slate-700 text-xs">
                  การจัดการ
                </th>
                <th className="px-3.5 py-3 w-36 min-w-[130px] font-mono bg-[#F8FAFC] font-semibold text-slate-700 text-xs">
                  เลขที่คำร้อง (EDR No.)
                </th>
                <th className="px-3.5 py-3 w-32 min-w-[110px] font-mono bg-[#F8FAFC] font-semibold text-slate-700 text-xs">
                  รหัสเอกสาร (ED Code)
                </th>
                <th className="px-3.5 py-3 min-w-[220px] bg-[#F8FAFC] font-semibold text-slate-700 text-xs">
                  ชื่อเอกสาร / มาตรฐาน
                </th>
                <th className="px-3.5 py-3 w-32 min-w-[120px] bg-[#F8FAFC] font-semibold text-slate-700 text-xs">
                  ประเภท
                </th>
                <th className="px-3.5 py-3 w-32 min-w-[120px] bg-[#F8FAFC] font-semibold text-slate-700 text-xs">
                  สถานะ
                </th>
                <th className="px-3.5 py-3 w-52 min-w-[170px] bg-[#F8FAFC] font-semibold text-slate-700 text-xs">
                  ผู้รับผิดชอบปัจจุบัน
                </th>
                <th className="px-3.5 py-3 w-28 min-w-[100px] text-right font-mono bg-[#F8FAFC] font-semibold text-slate-700 text-xs">
                  วันที่ยื่น
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagination.paginatedData.map((req) => {
                const reqCode = req.requestId || req.requestNo || req.id;
                const isReturned = req.status === 'REVISE_REQUESTED';

                return (
                  <tr 
                    key={req.id || reqCode}
                    className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                    onClick={() => navigate(`/dcc/external/requests/${reqCode}`)}
                  >
                    {/* 1. การจัดการ: Eye icon and quick edit */}
                    <td className="px-3 py-2.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/dcc/external/requests/${reqCode}`)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="ดูรายละเอียดคำร้อง (View Details)"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleOpenPreview(req, e)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                          title="ดูตัวอย่างเอกสาร (Preview)"
                        >
                          <FileText size={15} />
                        </button>
                        {isReturned && (
                          <button
                            type="button"
                            onClick={(e) => handleOpenResubmit(req, e)}
                            className="p-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-100 rounded-lg transition-colors cursor-pointer"
                            title="แก้ไขคำร้องด่วน (Quick Edit & Resubmit)"
                          >
                            <Edit3 size={15} />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 2. เลขที่คำร้อง (EDR No.): Blue link */}
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dcc/external/requests/${reqCode}`);
                        }}
                        className="font-mono font-bold text-[#0D99FF] text-sm hover:underline cursor-pointer"
                      >
                        {reqCode}
                      </span>
                    </td>

                    {/* 3. รหัสเอกสาร (ED Code): Blue code badge */}
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {req.edCode || req.doc_code || '-'}
                      </span>
                    </td>

                    {/* 4. ชื่อเอกสาร / มาตรฐาน */}
                    <td className="px-3.5 py-3 font-medium text-slate-800 break-words min-w-0 text-sm leading-relaxed" title={req.title}>
                      <div className="flex flex-col min-w-0 py-0.5">
                        <span className="font-semibold text-slate-900 line-clamp-2 leading-snug">
                          {req.title}
                        </span>
                        <span className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                          {req.source ? <span className="text-slate-600 font-medium">{req.source}</span> : null}
                          {req.source && req.department ? <span>•</span> : null}
                          {req.department ? <span>{req.department}</span> : null}
                        </span>
                      </div>
                    </td>

                    {/* 5. ประเภท */}
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      {renderTypeBadge(req.requestType || 'NEW')}
                    </td>

                    {/* 6. สถานะ */}
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      {renderStatusBadge(req.status)}
                    </td>

                    {/* 7. ผู้รับผิดชอบปัจจุบัน */}
                    <td className="px-3.5 py-3 text-slate-700 whitespace-nowrap min-w-0">
                      {getCurrentHandler(req)}
                    </td>

                    {/* 8. วันที่ยื่น */}
                    <td className="px-3.5 py-3 text-[#666666] text-right font-mono text-xs sm:text-sm whitespace-nowrap">
                      {formatDate(req.createdAt)}
                    </td>
                  </tr>
                );
              })}

              {/* Empty State */}
              {pagination.paginatedData.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center text-[#888888]">
                    <FileText className="w-10 h-10 text-[#CCCCCC] mx-auto mb-2" strokeWidth={1.5} />
                    <p className="text-sm font-semibold text-slate-700">
                      ไม่พบรายการคำร้องเอกสารภายนอก
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                      {searchTerm 
                        ? `ไม่พบคำร้องที่ตรงกับคำค้นหา "${searchTerm}"`
                        : activeStatus !== 'ALL' 
                          ? `ไม่มีรายการคำร้องในสถานะ "${STATUS_FILTERS.find(f => f.id === activeStatus)?.label}" ในขณะนี้`
                          : 'คุณยังไม่มีประวัติการยื่นคำร้องเอกสารภายนอก สามารถเริ่มลงทะเบียนเอกสารใหม่ได้ทันที'}
                    </p>
                    {(searchTerm || activeStatus !== 'ALL') ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setActiveStatus('ALL');
                          pagination.setCurrentPage(1);
                        }}
                        className="mt-3.5 h-8 px-3.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <FilterX size={13} />
                        <span>ล้างตัวกรองทั้งหมด</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDocToEdit(null);
                          setResubmitTaskId(null);
                          setIsFormOpen(true);
                        }}
                        className="mt-3.5 h-8.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>ลงทะเบียนเอกสารใหม่</span>
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Universal Pagination */}
        <TablePagination
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
          pageSizeOptions={[10, 20, 30, 50]}
        />
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. Form Modal for New Register or Edit / Resubmit */}
      <ExternalDocFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setDocToEdit(null);
          setResubmitTaskId(null);
        }}
        documentToEdit={docToEdit}
        resubmitTaskId={resubmitTaskId}
      />

      {/* 2. Watermarked PDF Preview Modal */}
      <ExternalDocPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setSelectedDocForPreview(null);
        }}
        document={selectedDocForPreview}
      />
    </div>
  );
};

export default MyExternalRequests;
