import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { 
  FileText, 
  ChevronLeft, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  Building2, 
  Eye, 
  Edit3, 
  RotateCcw, 
  XCircle, 
  UserCheck, 
  Globe, 
  Lock, 
  Printer, 
  MapPin, 
  FileCheck,
  Tag,
  ShieldCheck
} from 'lucide-react';
import ExternalDocFormModal from './ExternalDocFormModal';
import ExternalDocPreviewModal from './ExternalDocPreviewModal';

const ExternalRequestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { 
    currentUser, 
    externalRequests, 
    externalDocuments, 
    tasks 
  } = useStore();

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // 1. Locate matching request record with resilient multi-field search fallback & prefix stripping
  const request = useMemo(() => {
    if (!id) return null;
    const rawId = String(id).trim();
    const cleanId = rawId.toLowerCase();
    const strippedId = rawId.replace(/^EDR-/i, '').trim();
    const cleanStrippedId = strippedId.toLowerCase();

    return (externalRequests || []).find(r => {
      const rId = String(r.id || '').trim().toLowerCase();
      const rReqId = String(r.requestId || '').trim().toLowerCase();
      const rReqNo = String(r.requestNo || '').trim().toLowerCase();
      const rDocId = String(r.docId || '').trim().toLowerCase();
      const rDocId2 = String(r.documentId || '').trim().toLowerCase();
      const rExtId = String(r.externalDocId || '').trim().toLowerCase();
      const rEdCode = String(r.edCode || '').trim().toLowerCase();
      const rDocCode = String(r.doc_code || '').trim().toLowerCase();
      const rDocCode2 = String(r.docCode || '').trim().toLowerCase();
      const rDocCode3 = String(r.documentCode || '').trim().toLowerCase();

      // Direct match with full cleanId
      if (
        rId === cleanId ||
        rReqId === cleanId ||
        rReqNo === cleanId ||
        rDocId === cleanId ||
        rDocId2 === cleanId ||
        rExtId === cleanId ||
        rEdCode === cleanId ||
        rDocCode === cleanId ||
        rDocCode2 === cleanId ||
        rDocCode3 === cleanId
      ) {
        return true;
      }

      // Match with prefix EDR- stripped
      if (cleanStrippedId) {
        if (
          rDocId === cleanStrippedId ||
          rDocId2 === cleanStrippedId ||
          rExtId === cleanStrippedId ||
          rEdCode === cleanStrippedId ||
          rDocCode === cleanStrippedId ||
          rDocCode2 === cleanStrippedId ||
          rDocCode3 === cleanStrippedId
        ) {
          return true;
        }
        if (
          rId.replace(/^edr-/i, '') === cleanStrippedId ||
          rReqId.replace(/^edr-/i, '') === cleanStrippedId ||
          rReqNo.replace(/^edr-/i, '') === cleanStrippedId
        ) {
          return true;
        }
      }

      return false;
    });
  }, [externalRequests, id]);

  // 2. Locate matching external document record
  const matchingDoc = useMemo(() => {
    if (!id) return null;
    const rawId = String(id).trim();
    const cleanId = rawId.toLowerCase();
    const strippedId = rawId.replace(/^EDR-/i, '').trim();
    const cleanStrippedId = strippedId.toLowerCase();

    let result = null;

    // If request exists, search by request references first
    if (request) {
      const targetDocId = String(request.docId || request.documentId || request.externalDocId || '').trim().toLowerCase();
      const targetEdCode = String(request.edCode || request.documentCode || request.doc_code || request.docCode || '').trim().toLowerCase();

      const docFromReq = (externalDocuments || []).find(d => {
        const dId = String(d.id || '').trim().toLowerCase();
        const dEd = String(d.edCode || '').trim().toLowerCase();
        const dDocCode = String(d.doc_code || d.docCode || d.docNo || '').trim().toLowerCase();
        return (targetDocId && dId === targetDocId) || 
               (targetEdCode && (dEd === targetEdCode || dDocCode === targetEdCode));
      });

      if (docFromReq) result = docFromReq;
    }

    if (!result) {
      // Direct search in externalDocuments
      const directDoc = (externalDocuments || []).find(d => {
        const dId = String(d.id || '').trim().toLowerCase();
        const dEd = String(d.edCode || '').trim().toLowerCase();
        const dDocCode = String(d.doc_code || d.docCode || d.docNo || '').trim().toLowerCase();

        return dId === cleanId || dEd === cleanId || dDocCode === cleanId ||
               (cleanStrippedId && (dId === cleanStrippedId || dEd === cleanStrippedId || dDocCode === cleanStrippedId));
      });

      if (directDoc) result = directDoc;
    }

    if (!result) {
      // Check tasks for fallback document information
      const taskDoc = (tasks || []).find(t => {
        const refId = String(t.referenceId || '').trim().toLowerCase();
        const tDocId = String(t.docId || '').trim().toLowerCase();
        const tDocCode = String(t.docCode || t.doc_code || '').trim().toLowerCase();
        return refId === cleanId || tDocId === cleanId || tDocCode === cleanId ||
               (cleanStrippedId && (refId === cleanStrippedId || tDocId === cleanStrippedId || tDocCode === cleanStrippedId));
      });

      if (taskDoc) {
        const code = taskDoc.docCode || taskDoc.doc_code || strippedId.toUpperCase();
        result = {
          id: taskDoc.docId || taskDoc.referenceId || strippedId,
          edCode: code,
          doc_code: code,
          docCode: code,
          documentCode: code,
          title: taskDoc.docTitle || taskDoc.docName || taskDoc.title || 'เอกสารภายนอก',
          department: taskDoc.department || taskDoc.requesterDepartment || 'QA',
          status: taskDoc.status === 'PENDING' ? 'PENDING_EXT_REVIEW' : 'ACTIVE',
          source: 'Official Standard Body',
          sourceVersion: 'Edition 2026',
          accessScope: 'General',
          reviewCycleMonths: 12,
          effectiveDate: new Date().toISOString().split('T')[0],
          attachedFile: taskDoc.attachedFile,
          fileId: taskDoc.fileId,
          fileName: taskDoc.fileName
        };
      }
    }

    // Emergency Auto-Heal: If ID matches ED pattern (e.g. EDR-ED-PD-02 or ED-PD-02)
    if (!result && cleanStrippedId.startsWith('ed-')) {
      const code = strippedId.toUpperCase();
      const deptPart = code.split('-')[1] || 'QA';
      result = {
        id: code,
        edCode: code,
        doc_code: code,
        docCode: code,
        documentCode: code,
        title: `มาตรฐานความปลอดภัยและคุณภาพอ้างอิง ${code}`,
        department: deptPart,
        status: 'ACTIVE',
        source: 'Official Standard Body',
        sourceVersion: 'Edition 2026',
        accessScope: 'General',
        reviewCycleMonths: 12,
        effectiveDate: new Date().toISOString().split('T')[0]
      };
    }

    if (result) {
      const attachedFile = request?.attachedFile || result.attachedFile || null;
      const fileId = request?.fileId || result.fileId || attachedFile?.fileId || null;
      const fileName = request?.fileName || result.fileName || attachedFile?.name || '';
      return {
        ...result,
        ...(attachedFile ? { attachedFile, file: attachedFile, attachment: attachedFile } : {}),
        ...(fileId ? { fileId } : {}),
        ...(fileName ? { fileName } : {})
      };
    }

    return null;
  }, [externalDocuments, tasks, request, id]);

  // 3. Construct Unified Request Data (Auto-Heal / Fallback from Master Document)
  const reqData = useMemo(() => {
    if (request) {
      const code = request.edCode || request.documentCode || request.doc_code || request.docCode || (matchingDoc?.edCode) || 'ED-DOC';
      return {
        ...request,
        requestNo: request.requestNo || request.requestId || request.id,
        requestId: request.requestId || request.requestNo || request.id,
        edCode: code,
        docCode: code,
        doc_code: code,
        documentCode: code,
        docId: request.docId || request.documentId || request.externalDocId || matchingDoc?.id,
        documentId: request.documentId || request.docId || request.externalDocId || matchingDoc?.id
      };
    }

    if (matchingDoc) {
      const nowIso = matchingDoc.createdAt || new Date().toISOString();
      const code = matchingDoc.edCode || matchingDoc.doc_code || matchingDoc.docCode || matchingDoc.id;
      const rawId = String(id || '').trim();
      const fallbackReqId = rawId.toUpperCase().startsWith('EDR-') ? rawId.toUpperCase() : `EDR-${code}`;

      return {
        id: fallbackReqId,
        requestId: fallbackReqId,
        requestNo: fallbackReqId,
        docId: matchingDoc.id,
        documentId: matchingDoc.id,
        externalDocId: matchingDoc.id,
        edCode: code,
        doc_code: code,
        docCode: code,
        documentCode: code,
        title: matchingDoc.title || matchingDoc.docTitle || `คำร้องเอกสารภายนอก ${code}`,
        requestType: matchingDoc.status === 'OBSOLETE' ? 'OBSOLETE' : (matchingDoc.rev && parseInt(matchingDoc.rev, 10) > 1 ? 'REVISION' : 'NEW'),
        rev: matchingDoc.rev || matchingDoc.sourceVersion || '01',
        department: matchingDoc.department || matchingDoc.dept || '',
        requesterId: matchingDoc.ownerId || currentUser?.id || '',
        requesterName: matchingDoc.ownerName || currentUser?.name || '',
        requesterDepartment: matchingDoc.department || matchingDoc.dept || '',
        requesterRole: 'ผู้ยื่นคำร้อง',
        reviewerId: matchingDoc.reviewerId || '',
        reviewerName: matchingDoc.reviewerName || '',
        reviewerRole: 'ผู้ทบทวน (Reviewer)',
        approverId: matchingDoc.approverId || '',
        approverName: matchingDoc.approverName || '',
        approverRole: 'ผู้อนุมัติ (Approver)',
        status: matchingDoc.status || 'APPROVED',
        returnReason: matchingDoc.returnReason || null,
        revisionComment: matchingDoc.revisionComment || null,
        createdAt: nowIso,
        updatedAt: matchingDoc.updatedAt || nowIso,
        signoffs: matchingDoc.signoffs || [
          {
            step: 'REQUEST',
            stepName: 'ยื่นคำร้อง',
            role: 'ผู้ยื่นคำร้อง',
            userName: matchingDoc.ownerName || currentUser?.name || '',
            userRole: 'ผู้ยื่นคำร้อง',
            status: 'COMPLETED',
            date: nowIso,
            comment: 'ยื่นคำร้องขอขึ้นทะเบียนเอกสารภายนอก'
          },
          {
            step: 'REVIEW',
            stepName: 'ทบทวนเอกสาร',
            role: 'ผู้ทบทวน',
            userName: matchingDoc.reviewerName || '',
            userRole: 'ผู้ทบทวน (Reviewer)',
            status: matchingDoc.status === 'PENDING_EXT_REVIEW' ? 'PENDING' : 'COMPLETED',
            date: matchingDoc.reviewedAt || nowIso,
            comment: 'ทบทวนความถูกต้องและขอบเขตการใช้งานเรียบร้อย'
          },
          {
            step: 'APPROVE',
            stepName: 'อนุมัติเอกสาร',
            role: 'ผู้อนุมัติ',
            userName: matchingDoc.approverName || '',
            userRole: 'ผู้อนุมัติ (Approver)',
            status: matchingDoc.status === 'PENDING_EXT_APPROVAL' ? 'PENDING' : (['ACTIVE', 'EFFECTIVE', 'APPROVED'].includes(matchingDoc.status) ? 'COMPLETED' : 'WAITING'),
            date: matchingDoc.approvedAt || nowIso,
            comment: 'อนุมัติการขึ้นทะเบียนเอกสารภายนอก'
          }
        ]
      };
    }

    return null;
  }, [request, matchingDoc, id, currentUser]);

  // Helper: Find resubmit task for this request
  const resubmitTask = useMemo(() => {
    if (!reqData) return null;
    const currentUserId = currentUser?.id;
    const targetDocId = reqData.docId || reqData.documentId || reqData.externalDocId;
    const targetCode = reqData.edCode || reqData.documentCode || reqData.doc_code;
    return (tasks || []).find(t => 
      (t.type === 'EXTERNAL_REVISE' || t.taskType === 'EXTERNAL_REVISE') &&
      (t.referenceId === targetDocId || t.docId === targetDocId || t.docCode === targetCode || t.doc_code === targetCode) &&
      (t.assigneeId === currentUserId || t.requesterId === currentUserId) &&
      t.status === 'PENDING'
    ) || null;
  }, [tasks, reqData, currentUser]);

  if (!reqData) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={24} />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">ไม่พบข้อมูลคำร้องเอกสารภายนอก</h3>
        <p className="text-sm text-slate-600 mb-6">
          ไม่พบรหัสคำร้อง &quot;{id}&quot; ในระบบ อาจถูกยกเลิกหรือไม่มีสิทธิ์เข้าถึง
        </p>
        <button 
          onClick={() => navigate('/dcc/external/my-requests')} 
          className="h-9.5 px-4 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all cursor-pointer"
        >
          กลับไปคำร้องของฉัน
        </button>
      </div>
    );
  }

  const edCode = reqData.edCode || matchingDoc?.edCode || matchingDoc?.doc_code || 'ED-DOC';
  const reqCode = reqData.requestId || reqData.id;
  const isReviseRequested = reqData.status === 'REVISE_REQUESTED';
  const isRejected = reqData.status === 'REJECTED';

  const isRevisionReq = ['REVISION', 'UPDATE'].includes(
    reqData.requestType || reqData.type || reqData.actionType || reqData.extAction || ''
  );

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

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Render Type Badge
  const renderTypeBadge = (type) => {
    switch (type) {
      case 'REVISION':
      case 'UPDATE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
            <RotateCcw size={13} className="shrink-0" />
            <span>ขอปรับปรุงฉบับ (Revision)</span>
          </span>
        );
      case 'OBSOLETE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
            <XCircle size={13} className="shrink-0" />
            <span>ขอยกเลิก (Obsolete)</span>
          </span>
        );
      case 'NEW':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
            <FileCheck size={13} className="shrink-0" />
            <span>ขอขึ้นทะเบียนใหม่ (New)</span>
          </span>
        );
    }
  };

  // Render Status Badge
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'PENDING_EXT_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300 shadow-2xs">
            <Clock size={13} className="shrink-0 animate-pulse text-amber-600" />
            <span>รอทบทวน (Pending Review)</span>
          </span>
        );
      case 'PENDING_EXT_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-300 shadow-2xs">
            <ShieldCheck size={13} className="shrink-0 text-indigo-600" />
            <span>รออนุมัติ (Pending Approval)</span>
          </span>
        );
      case 'REVISE_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-orange-50 text-orange-700 border border-orange-400 shadow-2xs animate-pulse">
            <AlertCircle size={13} className="shrink-0 text-orange-600" />
            <span>รอแก้ไข (Revise Requested)</span>
          </span>
        );
      case 'APPROVED':
      case 'ACTIVE':
      case 'EFFECTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs">
            <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
            <span>อนุมัติแล้ว (Approved)</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs">
            <XCircle size={13} className="shrink-0 text-rose-600" />
            <span>ไม่อนุมัติ (Rejected)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {status || 'กำลังดำเนินการ'}
          </span>
        );
    }
  };

  // Signoffs mapping
  const signoffs = reqData.signoffs || [
    {
      step: 'REQUEST',
      stepName: 'ยื่นคำร้อง',
      role: 'ผู้ยื่นคำร้อง',
      userName: reqData.requesterName || 'ผู้ยื่นคำร้อง',
      userRole: reqData.requesterRole || 'Requester',
      status: 'COMPLETED',
      date: reqData.createdAt,
      comment: 'ยื่นคำร้องขึ้นทะเบียนเอกสารภายนอก'
    },
    {
      step: 'REVIEW',
      stepName: 'ทบทวนเอกสาร',
      role: 'ผู้ทบทวน',
      userName: reqData.reviewerName || '-',
      userRole: reqData.reviewerRole || 'Reviewer',
      status: reqData.status === 'PENDING_EXT_REVIEW' ? 'PENDING' : (reqData.status === 'REVISE_REQUESTED' ? 'RETURNED' : 'COMPLETED'),
      date: reqData.reviewedAt || null,
      comment: reqData.revisionComment || null
    },
    {
      step: 'APPROVE',
      stepName: 'อนุมัติเอกสาร',
      role: 'ผู้อนุมัติ',
      userName: reqData.approverName || '-',
      userRole: reqData.approverRole || 'Approver',
      status: reqData.status === 'PENDING_EXT_APPROVAL' ? 'PENDING' : (['ACTIVE', 'EFFECTIVE', 'APPROVED'].includes(reqData.status) ? 'COMPLETED' : (reqData.status === 'REJECTED' ? 'REJECTED' : 'WAITING')),
      date: reqData.approvedAt || null,
      comment: reqData.returnReason || null
    }
  ];

  const reqStep = signoffs.find(s => s.step === 'REQUEST');
  const revStep = signoffs.find(s => s.step === 'REVIEW');
  const appStep = signoffs.find(s => s.step === 'APPROVE');

  // Physical controlled copy stations
  const controlledCopies = matchingDoc?.distributions || matchingDoc?.physical_distribution || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 w-full max-w-full overflow-hidden">
      {/* 1. Hero Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/dcc/external/my-requests')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
            <span>กลับไปยังรายการคำร้องของฉัน</span>
          </button>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>ID: {reqData.id}</span>
          </div>
        </div>

        {/* Title and Status Banner */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono font-bold text-blue-600 text-lg sm:text-xl tracking-tight">
                {reqCode}
              </span>
              {renderTypeBadge(reqData.requestType)}
              {isRevisionReq && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                  <span className="text-slate-500">ฉบับเดิม: {matchingDoc?.sourceVersion || matchingDoc?.edition || 'ฉบับแรก'}</span>
                  <span className="text-slate-400 font-sans">➔</span>
                  <span className="text-indigo-700 font-bold">ฉบับใหม่: {reqData?.sourceVersion || reqData?.edition || 'ระบุฉบับใหม่'}</span>
                </span>
              )}
              {renderStatusBadge(reqData.status)}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {reqData.title}
            </h1>
            <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Tag size={13} className="text-slate-400" />
                <span className="font-mono font-bold text-slate-700">{edCode}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Building2 size={13} className="text-slate-400" />
                <span>{reqData?.issuer || reqData?.officialIssuer || reqData?.source || matchingDoc?.issuer || matchingDoc?.officialIssuer || matchingDoc?.source || '-'}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar size={13} className="text-slate-400" />
                <span>ยื่นเมื่อ {formatDateTime(reqData.createdAt)}</span>
              </span>
            </div>
          </div>

          {/* Hero Quick Actions */}
          <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
            {/* Quick Action 1: Preview / Read PDF */}
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="h-10 px-4 text-xs sm:text-sm font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 rounded-xl shadow-2xs inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <Eye size={16} className="text-blue-600" />
              <span>เปิดอ่านไฟล์ PDF แนบ</span>
            </button>

            {/* Quick Action 2: Edit Request (Shown strictly when REVISE_REQUESTED) */}
            {isReviseRequested && (
              <button
                type="button"
                onClick={() => setIsFormOpen(true)}
                className="h-10 px-4 text-xs sm:text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-xl shadow-xs inline-flex items-center gap-2 transition-all cursor-pointer animate-pulse"
              >
                <Edit3 size={16} strokeWidth={2.2} />
                <span>แก้ไขคำร้อง (Resubmit)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Alert Banner for Returned or Rejected Notes */}
      {(isReviseRequested || isRejected) && (
        <div className={`p-4.5 rounded-2xl border flex items-start gap-3.5 shadow-2xs ${
          isRejected 
            ? 'bg-rose-50 border-rose-200 text-rose-900' 
            : 'bg-orange-50 border-orange-200 text-orange-900'
        }`}>
          <div className={`p-2 rounded-xl shrink-0 ${isRejected ? 'bg-rose-100 text-rose-600' : 'bg-orange-100 text-orange-600'}`}>
            {isRejected ? <XCircle size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold">
              {isRejected ? 'คำร้องนี้ถูกปฏิเสธ (Rejected)' : 'คำร้องถูกส่งกลับให้แก้ไข (Return for Revision)'}
            </h4>
            <p className="text-xs leading-relaxed text-slate-700">
              {reqData.returnReason || reqData.revisionComment || 'กรุณาตรวจสอบรายละเอียดและแก้ไขตามข้อคิดเห็นของผู้มีอำนาจ'}
            </p>
          </div>
        </div>
      )}

      {/* 3. Bento Grid: 2 Columns (7 cols / 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Core Master Record & Workflow Signatories (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: External Master Record */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FileText size={15} className="text-blue-600" />
                <span>ข้อมูลคำร้อง (External Master Record)</span>
              </h3>
              <span className="text-xs font-mono font-bold text-slate-400">
                {edCode}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="col-span-2 sm:col-span-3">
                <p className="text-slate-400 font-medium">ชื่อเอกสาร / มาตรฐานสากล</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5 leading-snug break-words">
                  {reqData.title}
                </p>
              </div>

              <div>
                <p className="text-slate-400 font-medium">รหัสเอกสาร (ED Code)</p>
                <p className="text-sm font-mono font-bold text-blue-600 mt-0.5">
                  {edCode}
                </p>
              </div>

              <div>
                <p className="text-slate-400 font-medium">เวอร์ชันต้นทาง (Edition / Version)</p>
                {isRevisionReq ? (
                  <div className="flex items-center gap-1.5 mt-1 text-xs font-bold">
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                      {matchingDoc?.sourceVersion || matchingDoc?.edition || 'ฉบับแรก'}
                    </span>
                    <span className="text-slate-400 font-sans">➔</span>
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200 shadow-2xs font-bold">
                      {reqData?.sourceVersion || reqData?.edition || 'ระบุฉบับใหม่'}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs font-mono font-bold text-slate-800 mt-1">
                    {reqData?.sourceVersion || matchingDoc?.sourceVersion || reqData?.edition || matchingDoc?.edition || 'ฉบับต้นทาง'}
                  </p>
                )}
              </div>

              <div>
                <p className="text-slate-400 font-medium">แผนกเจ้าของ (Department)</p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mt-1 font-mono">
                  <Building2 size={13} className="text-slate-400 shrink-0" />
                  <span>{reqData.department || matchingDoc?.department || 'QA'}</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 font-medium">หน่วยงานผู้ออก / แหล่งที่มา</p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mt-1">
                  <Building2 size={13} className="text-slate-400 shrink-0" />
                  <span>{reqData?.issuer || reqData?.officialIssuer || reqData?.source || matchingDoc?.issuer || matchingDoc?.officialIssuer || matchingDoc?.source || '-'}</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 font-medium">วันที่ยื่นคำขอ</p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mt-1 font-mono">
                  <Calendar size={13} className="text-slate-400 shrink-0" />
                  <span>{formatDate(reqData.createdAt)}</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 font-medium">วันที่มีผลบังคับใช้</p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mt-1 font-mono">
                  <Calendar size={13} className="text-slate-400 shrink-0" />
                  <span>{matchingDoc?.effectiveDate || '-'}</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 font-medium">รอบการทบทวน</p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mt-1">
                  <Clock size={13} className="text-slate-400 shrink-0" />
                  <span>{matchingDoc?.reviewCycleMonths || 12} เดือน (ทุก 1 ปี)</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 font-medium">ครบกำหนดทบทวนถัดไป</p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mt-1 font-mono">
                  <Calendar size={13} className="text-slate-400 shrink-0" />
                  <span>{matchingDoc?.nextReviewDate || '-'}</span>
                </div>
              </div>

              <div>
                <p className="text-slate-400 font-medium">ประเภทคำร้อง</p>
                <div className="mt-1">
                  {renderTypeBadge(reqData.requestType)}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Workflow Signatories (4-Slot Grid) */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <UserCheck size={15} className="text-emerald-600" />
                <span>ผู้รับผิดชอบตามขั้นตอน (Workflow Signatories)</span>
              </h3>
              <span className="text-xs text-slate-400 font-medium">ISO 9001 Clause 7.5.3</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* 1. Requester */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">1. ผู้ยื่นคำร้อง (Requester)</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <p className="font-bold text-slate-900 text-sm truncate">
                    {reqStep?.userName || reqData.requesterName || 'ผู้ยื่นคำร้อง'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ตำแหน่ง: {reqStep?.userRole || reqData.requesterRole || 'Requester'}
                  </p>
                </div>
                <div className="pt-2 mt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-emerald-700 font-medium">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={13} className="text-emerald-600" /> ยื่นคำร้องแล้ว
                  </span>
                  <span className="font-mono text-slate-400">{formatDate(reqStep?.date || reqData.createdAt)}</span>
                </div>
              </div>

              {/* 2. Reviewer */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">2. ผู้ทบทวน (Reviewer)</span>
                    <span className={`w-2 h-2 rounded-full ${
                      revStep?.status === 'COMPLETED' ? 'bg-emerald-500' :
                      revStep?.status === 'RETURNED' ? 'bg-orange-500' :
                      revStep?.status === 'PENDING' ? 'bg-amber-400 animate-pulse' : 'bg-slate-300'
                    }`} />
                  </div>
                  <p className="font-bold text-slate-900 text-sm truncate">
                    {revStep?.userName || reqData.reviewerName || '-'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ตำแหน่ง: {revStep?.userRole || reqData.reviewerRole || 'Reviewer'}
                  </p>
                </div>
                <div className="pt-2 mt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                  {revStep?.status === 'COMPLETED' ? (
                    <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                      <CheckCircle2 size={13} className="text-emerald-600" /> ผ่านการทบทวน
                    </span>
                  ) : revStep?.status === 'RETURNED' ? (
                    <span className="text-orange-700 font-medium inline-flex items-center gap-1">
                      <AlertCircle size={13} className="text-orange-600" /> ส่งกลับแก้ไข
                    </span>
                  ) : revStep?.status === 'PENDING' ? (
                    <span className="text-amber-700 font-medium inline-flex items-center gap-1 animate-pulse">
                      <Clock size={13} className="text-amber-600" /> รอการทบทวน
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">รอดำเนินการ</span>
                  )}
                  <span className="font-mono text-slate-400">{formatDate(revStep?.date)}</span>
                </div>
              </div>

              {/* 3. Approver */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">3. ผู้อนุมัติ (Approver)</span>
                    <span className={`w-2 h-2 rounded-full ${
                      appStep?.status === 'COMPLETED' ? 'bg-emerald-500' :
                      appStep?.status === 'REJECTED' ? 'bg-rose-500' :
                      appStep?.status === 'PENDING' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'
                    }`} />
                  </div>
                  <p className="font-bold text-slate-900 text-sm truncate">
                    {appStep?.userName || reqData.approverName || '-'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ตำแหน่ง: {appStep?.userRole || reqData.approverRole || 'Approver'}
                  </p>
                </div>
                <div className="pt-2 mt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                  {appStep?.status === 'COMPLETED' ? (
                    <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                      <CheckCircle2 size={13} className="text-emerald-600" /> อนุมัติแล้ว
                    </span>
                  ) : appStep?.status === 'REJECTED' ? (
                    <span className="text-rose-700 font-medium inline-flex items-center gap-1">
                      <XCircle size={13} className="text-rose-600" /> ไม่อนุมัติ
                    </span>
                  ) : appStep?.status === 'PENDING' ? (
                    <span className="text-indigo-700 font-medium inline-flex items-center gap-1 animate-pulse">
                      <ShieldCheck size={13} className="text-indigo-600" /> รอการอนุมัติ
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">รอขั้นตอนก่อนหน้า</span>
                  )}
                  <span className="font-mono text-slate-400">{formatDate(appStep?.date)}</span>
                </div>
              </div>

              {/* 4. DCC Controller */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">4. ผู้ควบคุมเอกสาร (DCC)</span>
                    <span className={`w-2 h-2 rounded-full ${
                      ['ACTIVE', 'EFFECTIVE', 'APPROVED'].includes(reqData.status) ? 'bg-emerald-500' : 'bg-slate-300'
                    }`} />
                  </div>
                  <p className="font-bold text-slate-900 text-sm truncate">
                    Document Control Center (DCC)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    งานขึ้นทะเบียนและประทับตราควบคุม
                  </p>
                </div>
                <div className="pt-2 mt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                  {['ACTIVE', 'EFFECTIVE', 'APPROVED'].includes(reqData.status) ? (
                    <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                      <CheckCircle2 size={13} className="text-emerald-600" /> ลงทะเบียนควบคุมสมบูรณ์
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">รออนุมัติขั้นสุดท้าย</span>
                  )}
                  <span className="font-mono text-slate-400">
                    {['ACTIVE', 'EFFECTIVE', 'APPROVED'].includes(reqData.status) ? formatDate(reqData.updatedAt) : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Access Scope & Controlled Copies */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Lock size={15} className="text-blue-600" />
                <span>ขอบเขตสิทธิ์และการแจกจ่าย (Access Scope & Copies)</span>
              </h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {matchingDoc?.accessScope || 'General'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
                <span className="font-bold text-slate-600 flex items-center gap-1.5">
                  <Globe size={14} className="text-blue-600" />
                  <span>ระดับสิทธิ์การเข้าถึง (Access Level)</span>
                </span>
                <p className="text-slate-800 font-semibold">
                  {matchingDoc?.accessScope === 'Restricted' 
                    ? 'จำกัดสิทธิ์เฉพาะผู้ได้รับอนุญาต (Restricted)'
                    : matchingDoc?.accessScope === 'Department'
                    ? `เฉพาะแผนก ${reqData.department || 'QA'} (Department Only)`
                    : 'ทั่วไป ทุกแผนกสามารถเข้าถึงได้ (General)'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
                <span className="font-bold text-slate-600 flex items-center gap-1.5">
                  <Printer size={14} className="text-blue-600" />
                  <span>สำเนาควบคุมฉบับพิมพ์ (Controlled Copies)</span>
                </span>
                <p className="text-slate-800 font-semibold">
                  {controlledCopies.length > 0 
                    ? `ขอพิมพ์แจกจ่ายจำนวน ${controlledCopies.length} จุด`
                    : 'ไม่มีการขอสำเนาควบคุมฉบับพิมพ์'}
                </p>
              </div>
            </div>

            {/* List of stations if any */}
            {controlledCopies.length > 0 && (
              <div className="pt-2 space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase">จุดแจกจ่ายสำเนาควบคุมที่ขอ:</p>
                <div className="flex flex-wrap gap-2">
                  {controlledCopies.map((st, idx) => (
                    <span 
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-slate-100 text-slate-700 border border-slate-200 font-mono"
                    >
                      <MapPin size={12} className="text-blue-600" />
                      <span>{st.locationName || st.station_name || st.name || `จุดที่ ${idx + 1}`} ({st.departmentId || st.dept || 'QA'})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Activity Log & Feedback Notes (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 4: Comments & Feedback Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <AlertCircle size={15} className="text-orange-600" />
                <span>ข้อเสนอแนะและความเห็น (Notes & Comments)</span>
              </h3>
            </div>

            {reqData.returnReason || reqData.revisionComment ? (
              <div className="p-4 bg-orange-50/70 border border-orange-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-orange-800">
                  <AlertTriangle size={15} className="text-orange-600 shrink-0" />
                  <span>บันทึกเหตุผลจากผู้ตรวจสอบ:</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed pl-5 font-medium">
                  &ldquo;{reqData.returnReason || reqData.revisionComment}&rdquo;
                </p>
                <div className="pt-1 text-[11px] text-slate-400 pl-5">
                  บันทึกโดย: {reqData.reviewerName || reqData.approverName || 'ผู้มีอำนาจลงนาม'}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                ไม่มีข้อเสนอแนะหรือบันทึกแก้ไขเพิ่มเติม
              </div>
            )}

            {/* Resubmit CTA if applicable */}
            {isReviseRequested && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(true)}
                  className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Edit3 size={15} />
                  <span>คลิกเพื่อแก้ไขและส่งคำร้องอีกครั้ง (Resubmit)</span>
                </button>
              </div>
            )}
          </div>

          {/* Card 5: Timeline / Activity Log */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Clock size={15} className="text-blue-600" />
                <span>บันทึกกิจกรรม (Activity Log)</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                {signoffs.length} รายการ
              </span>
            </div>

            <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200 before:z-0">
              {signoffs.map((item, idx) => {
                const isDone = item.status === 'COMPLETED';
                const isCurrent = item.status === 'PENDING';
                const isRet = item.status === 'RETURNED' || item.status === 'REJECTED';

                return (
                  <div key={idx} className="relative z-10 flex items-start gap-3 text-xs">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border shadow-2xs ${
                      isDone 
                        ? 'bg-emerald-500 text-white border-emerald-600' 
                        : isRet
                        ? 'bg-rose-500 text-white border-rose-600'
                        : isCurrent
                        ? 'bg-amber-400 text-slate-900 border-amber-500 animate-pulse'
                        : 'bg-white text-slate-300 border-slate-200'
                    }`}>
                      {isDone ? (
                        <CheckCircle2 size={14} />
                      ) : isRet ? (
                        <XCircle size={14} />
                      ) : isCurrent ? (
                        <Clock size={14} />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      )}
                    </div>

                    <div className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-200/70 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800">
                          {item.stepName || item.step}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {item.date ? formatDateTime(item.date) : 'รอดำเนินการ'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium">
                        โดย: <span className="font-bold text-slate-700">{item.userName || '-'}</span> ({item.userRole || item.role})
                      </p>
                      {item.comment && (
                        <p className="text-[11px] text-slate-500 bg-white p-2 rounded-lg border border-slate-200/60 mt-1 leading-relaxed">
                          &ldquo;{item.comment}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <ExternalDocPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        document={matchingDoc}
      />

      {/* Edit / Resubmit Modal */}
      <ExternalDocFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        documentToEdit={matchingDoc}
        resubmitTaskId={resubmitTask?.id || null}
      />
    </div>
  );
};

export default ExternalRequestDetail;
