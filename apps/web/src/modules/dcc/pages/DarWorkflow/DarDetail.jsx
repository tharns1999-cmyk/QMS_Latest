import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { 
  FileText, 
  ChevronLeft, 
  CheckCircle, 
  AlertCircle, 
  History, 
  Sparkles,
  Download,
  ExternalLink,
  Calendar,
  Building2,
  Layers,
  CheckCircle2,
  Workflow,
  Upload
} from 'lucide-react';
import { isApiMode } from '../../../../api/client';
import { loadDars, replaceDarFile } from '../../../../api/dars';
import toast from 'react-hot-toast';
import DARComments from '../../components/workflow/DARComments';
import { resolveReviewer, resolveApprover } from '../../utils/workflowResolver';
import { getDarReason, getDarDetail, getDarDocInfo, isDarDraft, isDarRequester } from '../../utils/darHelper';
import DarReviewModal from '../../components/workflow/DarReviewModal';
import FileViewerModal from '../../components/modals/FileViewerModal';
import { UniversalWatermarkService, resolveWatermarkConfig } from '../../services/UniversalWatermarkService';

const DarDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dars, documents, timeline, currentUser, masterUsers, reviewUsers, approveUsers } = useStore();
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isFileViewerOpen, setIsFileViewerOpen] = useState(false);

  // API mode: other people move the DAR along, so read its current state on open.
  useEffect(() => {
    if (isApiMode) loadDars().catch(() => {});
  }, [id]);

  const dar = dars.find(d => d.id === id);
  const myTimeline = timeline.filter(t => t.darId === id).sort((a, b) => b.id - a.id);
  
  const darHistory = timeline.filter(t => t.darId === id);
  const getActor = (action) => darHistory.find(t => t.action === action)?.user || '-';
  
  const docInfo = getDarDocInfo(dar, documents);

  if (!dar) return <div className="p-6 text-[#666666] font-medium">ไม่พบข้อมูลคำร้อง DAR</div>;

  // Universal Draft Privacy Guard: Drafts are strictly confidential to the creator
  if (isDarDraft(dar) && !isDarRequester(dar, currentUser)) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white border border-amber-200 rounded-2xl shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={24} strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">ไม่สามารถเข้าถึงเอกสารฉบับร่างได้</h3>
        <p className="text-sm text-slate-600 mb-6">
          คำร้องนี้อยู่ในสถานะแบบร่าง (Draft) ซึ่งเป็นสิทธิ์ส่วนบุคคลของผู้สร้างคำร้องเท่านั้น ผู้ใช้อื่นหรือผู้ดูแลระบบไม่สามารถเปิดดูได้
        </p>
        <button 
          onClick={() => navigate(-1)} 
          className="btn-secondary text-xs px-4 py-2 cursor-pointer"
        >
          ย้อนกลับ
        </button>
      </div>
    );
  }

  const isAdmin = Boolean(currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN' || currentUser?.isDccAdmin);

  let workflow = null;
  if (isAdmin && dar) {
    if (Array.isArray(dar.workflowSteps) && dar.workflowSteps.length > 0) {
      const step1 = dar.workflowSteps.find(s => s.role === 'REQUESTER' || s.step === 1);
      const step2 = dar.workflowSteps.find(s => s.role === 'REVIEWER' || s.step === 2);
      const step3 = dar.workflowSteps.find(s => s.role === 'APPROVER' || s.step === 3);
      workflow = {
        requester: masterUsers?.find(u => u.id === (step1?.userId || dar.requesterId)) || { name: step1?.userName || dar.requesterName },
        reviewer: masterUsers?.find(u => u.id === (step2?.userId || dar.reviewerId)) || { name: step2?.userName || dar.reviewerName },
        approver: masterUsers?.find(u => u.id === (step3?.userId || dar.approverId)) || { name: step3?.userName || dar.approverName }
      };
    } else {
      const requester = masterUsers?.find(u => u.id === dar.requesterId);
      const revObj = resolveReviewer(dar.requesterId, dar.department, masterUsers, reviewUsers, dar.docType);
      const revId = revObj?.id || revObj;
      const reviewer = masterUsers?.find(u => u.id === revId);
      
      const appObj = revId ? resolveApprover(dar.requesterId, revId, dar.department, masterUsers, approveUsers, dar.docType) : null;
      const appId = appObj?.id || appObj;
      const approver = masterUsers?.find(u => u.id === appId);

      workflow = { requester, reviewer, approver };
    }
  }

  // Handle PDF Download / Preview via UniversalWatermarkService
  const handleDownloadAttachment = async () => {
    try {
      const toastId = toast.loading('กำลังสร้างไฟล์ PDF เอกสารแนบ...');
      const targetDoc = documents?.find(d => d.id === dar.docId || d.id === dar.docIdRef) || {
        id: dar.docId || dar.id,
        title: docInfo.docCode || dar.title,
        name: dar.title,
        doc_code: docInfo.docCode,
        rev: docInfo.docRev || '01',
        status: dar.status || 'EFFECTIVE',
        apiFilePath: dar.apiFilePath
      };
      const watermarkConfig = resolveWatermarkConfig(targetDoc, {
        currentUser,
        isHistoricalRev: false
      });
      await UniversalWatermarkService.generateAndDownloadPdf(targetDoc, watermarkConfig, {
        userName: currentUser?.name || 'User',
        userDept: currentUser?.department || 'General'
      });
      toast.dismiss(toastId);
      toast.success('ดาวน์โหลดไฟล์เอกสารแนบสำเร็จ');
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการดาวน์โหลดเอกสาร');
    }
  };

  const handlePreviewAttachment = () => {
    if (dar.attachedFile) {
      setIsFileViewerOpen(true);
    } else {
      toast.error('ไม่พบไฟล์แนบต้นฉบับ');
    }
  };

  const fileName = dar.attachedFile ? dar.attachedFile.name : (dar.file || `${docInfo.docCode || dar.title || 'Document'}.pdf`);
  const fileSize = dar.attachedFile
    ? (dar.attachedFile.size ? `${(dar.attachedFile.size / 1024 / 1024).toFixed(2)} MB` : 'PDF')
    : (isApiMode ? 'ยังไม่ได้แนบไฟล์' : (dar.fileSize || '2.4 MB'));
  const nextRev = String(parseInt(docInfo.docRev || '0', 10) + 1).padStart(2, '0');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-6 w-full max-w-full overflow-hidden">
      {/* Top Bar: Title & Inspector CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="ย้อนกลับ"
          >
            <ChevronLeft size={18} strokeWidth={1.5} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-slate-900 text-lg tracking-tight">
                {dar.darNumber || (dar.isDraft || dar.status === 'DRAFT' || String(dar.id).startsWith('draft_') ? 'ยังไม่ได้ระบุ (Draft)' : dar.id)}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase ${
                dar.type === 'OBSOLETE'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : dar.type === 'REVISION'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {dar.type === 'NEW' ? 'ขอจัดทำใหม่' : dar.type === 'REVISION' ? 'ขอแก้ไข' : dar.type === 'OBSOLETE' ? 'ขอยกเลิก' : dar.type}
              </span>
              {(dar.isDraft || dar.status === 'DRAFT' || String(dar.id).startsWith('draft_')) && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  ฉบับร่าง (Draft)
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">{dar.title}</h2>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsInspectorOpen(true)}
          className="inline-flex items-center h-8 px-3 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors self-start sm:self-auto cursor-pointer"
          title="เปิดหน้าต่างเอกสารฉบับเต็ม"
        >
          <span>เอกสารฉบับเต็ม</span>
        </button>
      </div>

      {/* Admin Workflow Integrity Tracker */}
      {isAdmin && workflow && (
        <div className="card-surface p-4 sm:p-5 shadow-xs border border-slate-200/90 rounded-2xl">
          <h3 className="font-semibold text-xs text-slate-700 border-b border-slate-100 pb-2.5 mb-3.5 flex items-center gap-2 uppercase tracking-wider">
            <Workflow className="text-slate-500" size={15} strokeWidth={1.5} />
            <span>ติดตามสายการอนุมัติ (Workflow Integrity Tracker)</span>
          </h3>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative">
             <div className="hidden md:block absolute top-1/2 left-8 right-8 h-0.5 bg-slate-200 -z-10 -translate-y-1/2"></div>
             
             {/* Requester Node */}
             <div className="flex flex-col items-center bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-2xs z-10 w-full md:w-1/3 max-w-[240px]">
               <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">ผู้ร้องขอ (Requester)</span>
               </div>
               <p className="font-semibold text-slate-900 text-sm text-center truncate w-full">{workflow.requester?.name || dar.requesterId}</p>
               <p className="text-[11px] text-slate-400 mt-0.5">ระดับตำแหน่ง: {workflow.requester?.level || '?'}</p>
             </div>

             {/* Reviewer Node */}
             <div className="flex flex-col items-center bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-2xs z-10 w-full md:w-1/3 max-w-[240px]">
               <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${dar.status === 'DRAFT' || dar.status === 'RETURNED_FOR_REVISION' || dar.status === 'CANCELLED' ? 'bg-slate-300' : dar.status === 'UNDER_REVIEW' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`}></div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">ผู้ทบทวน (Reviewer)</span>
               </div>
               <p className="font-semibold text-slate-900 text-sm text-center truncate w-full">{workflow.reviewer?.name || 'รอคำนวณ'}</p>
               <p className="text-[11px] text-slate-400 mt-0.5">ระดับตำแหน่ง: {workflow.reviewer?.level || '?'}</p>
             </div>

             {/* Approver Node */}
             <div className="flex flex-col items-center bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-2xs z-10 w-full md:w-1/3 max-w-[240px]">
               <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${dar.status === 'PENDING_APPROVAL' ? 'bg-amber-400 animate-pulse' : dar.status === 'WAITING_EFFECTIVE' || dar.status === 'APPROVED_WAITING_EFFECTIVE' || dar.status === 'WAITING_ACKNOWLEDGEMENT' || dar.status === 'EFFECTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">ผู้อนุมัติ (Approver)</span>
               </div>
               <p className="font-semibold text-slate-900 text-sm text-center truncate w-full">{workflow.approver?.name || 'รอคำนวณ'}</p>
               <p className="text-[11px] text-slate-400 mt-0.5">ระดับตำแหน่ง: {workflow.approver?.level || '?'}</p>
             </div>
          </div>
        </div>
      )}

      {/* Cancelled Alert Banner */}
      {dar.status === 'CANCELLED' && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 flex items-center gap-3 shadow-2xs">
          <AlertCircle className="text-rose-500 shrink-0" size={20} strokeWidth={1.5} />
          <div>
            <p className="font-bold text-xs">คำร้องถูกยกเลิก (CANCELLED)</p>
            <p className="text-xs text-rose-700 mt-0.5">ระบบได้ยกเลิกคำร้องนี้โดยอัตโนมัติเนื่องจากเกินกำหนดเวลา SLA (Overdue Day 4) ข้อมูลทั้งหมดอยู่ในสถานะ Read-only</p>
          </div>
        </div>
      )}

      {/* API mode: DCC puts the approved DAR into force */}
      {isApiMode && dar.apiStatus === 'PENDING_DCC' && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 flex items-center gap-3 shadow-2xs">
          <CheckCircle2 className="text-emerald-600 shrink-0" size={20} strokeWidth={1.5} />
          <div>
            <p className="font-bold text-xs">อนุมัติครบแล้ว รอวันมีผลบังคับใช้ {dar.effectiveDate || '-'}</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {dar.type === 'OBSOLETE' ? `เอกสาร ${dar.doc_code} จะถูกย้ายไปทะเบียนเอกสารยกเลิกเมื่อถึงวันดังกล่าว เวลา 00:00 น.` : `เอกสาร ${dar.doc_code} Rev.${dar.revision} จะมีผลบังคับใช้อัตโนมัติเมื่อถึงวันดังกล่าว เวลา 00:00 น.${dar.type === 'REVISION' ? ' และฉบับเดิมจะถูกย้ายไปทะเบียนฉบับเก่า' : ''}`}
            </p>
          </div>
        </div>
      )}

      {/* Two-Column Responsive Split Grid (7 cols / 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: DAR Core Information (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* Card 1: Master Metadata & Workflow Actors */}
          <div className="card-surface p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-5">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} strokeWidth={1.5} className="text-slate-400" /> ข้อมูลคำขอดำเนินการเอกสาร (DAR Master Record)
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  dar.status === 'EFFECTIVE' || dar.status === 'COMPLETED'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : dar.status === 'CANCELLED'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {dar.status}
                </span>
              </div>

              {/* Top Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-slate-400 font-medium">ชื่อเอกสาร (Document Name)</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5 leading-snug break-words">
                    {dar.title}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">รหัสเอกสาร</p>
                  <p className="text-sm font-mono font-semibold text-slate-900 mt-0.5">
                    {docInfo.docCode}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">ฉบับที่ (Revision)</p>
                  <div className="mt-0.5">
                    {dar.type === 'REVISION' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-xs font-mono font-semibold">
                        Rev.{docInfo.docRev} ➡️ Rev.{nextRev}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-mono font-semibold">
                        Rev.{docInfo.docRev}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">หมวดหมู่เอกสาร</p>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800 mt-1">
                    <Layers size={13} strokeWidth={1.5} className="text-slate-400 shrink-0" />
                    <span>{docInfo.docType}</span>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">แผนกเจ้าของ (Dept)</p>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800 mt-1 font-mono">
                    <Building2 size={13} strokeWidth={1.5} className="text-slate-400 shrink-0" />
                    <span>{dar.department}</span>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">วันที่ยื่นคำขอ</p>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800 mt-1 font-mono">
                    <Calendar size={13} strokeWidth={1.5} className="text-slate-400 shrink-0" />
                    <span>{dar.date}</span>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">วันที่มีผลบังคับใช้</p>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800 mt-1 font-mono">
                    <Calendar size={13} strokeWidth={1.5} className="text-slate-400 shrink-0" />
                    <span>{dar.effectiveDate || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Workflow Actors Sub-Grid */}
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 size={14} strokeWidth={1.5} className="text-emerald-600" />
                ผู้รับผิดชอบตามขั้นตอน (Workflow Signatories)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {/* 1. Requester */}
                <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 shadow-2xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">1. ผู้ร้องขอ</span>
                    <p className="font-semibold text-slate-800 truncate text-xs mt-0.5">
                      {dar.requesterName || getActor('Created') || '-'}
                    </p>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-medium shrink-0 inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> ยื่นคำร้องแล้ว
                  </span>
                </div>

                {/* 2. Reviewer */}
                <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 shadow-2xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">2. ผู้ทบทวน</span>
                    <p className="font-semibold text-slate-800 truncate text-xs mt-0.5">
                      {getActor('Reviewed') !== '-' ? getActor('Reviewed') : (workflow?.reviewer?.name || dar.reviewerName || '-')}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-600 font-medium shrink-0 inline-flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${getActor('Reviewed') !== '-' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    {getActor('Reviewed') !== '-' ? 'ทบทวนแล้ว' : 'รอการทบทวน'}
                  </span>
                </div>

                {/* 3. Approver */}
                <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 shadow-2xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">3. ผู้อนุมัติ</span>
                    <p className="font-semibold text-slate-800 truncate text-xs mt-0.5">
                      {getActor('Approved') !== '-' ? getActor('Approved') : (workflow?.approver?.name || dar.approverName || '-')}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-600 font-medium shrink-0 inline-flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${getActor('Approved') !== '-' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    {getActor('Approved') !== '-' ? 'อนุมัติแล้ว' : 'รอการอนุมัติ'}
                  </span>
                </div>

                {/* 4. Ack */}
                <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 shadow-2xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">4. การรับทราบ</span>
                    <p className="font-semibold text-slate-800 truncate text-xs mt-0.5">
                      {getActor('Acknowledged') !== '-' ? getActor('Acknowledged') : (dar.ackRequirement === 'REQUIRED' ? 'ต้องกดรับทราบ' : 'ไม่ต้องรับทราบ')}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium shrink-0 inline-flex items-center gap-1 ${
                    getActor('Acknowledged') !== '-' ? 'text-emerald-700' : dar.ackRequirement === 'REQUIRED' ? 'text-amber-700' : 'text-slate-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${getActor('Acknowledged') !== '-' ? 'bg-emerald-500' : dar.ackRequirement === 'REQUIRED' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                    {getActor('Acknowledged') !== '-' ? 'รับทราบแล้ว' : dar.ackRequirement === 'REQUIRED' ? 'Required' : 'Optional'}
                  </span>
                </div>
              </div>
            </div>

            {/* Distribution Sub-Section */}
            <div className="pt-4 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider block">
                การแจกจ่ายสำเนาควบคุม (Controlled Copy Distribution)
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1 max-h-24 overflow-y-auto">
                {dar.distributions?.length > 0 ? (
                  dar.distributions.map((d, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                      {d.departmentId} {d.locationName ? `· ${d.locationName}` : ''} {d.copyNo ? `(Copy ${d.copyNo})` : ''}
                    </span>
                  ))
                ) : dar.distributionMode === 'ALL' ? (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                    ทุกแผนกในองค์กร (All Departments)
                  </span>
                ) : dar.distributedDepts?.length > 0 ? (
                  dar.distributedDepts.map((d, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                      {d}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 text-xs italic">
                    ไม่มีรายการระบุการแจกจ่ายทางกายภาพ (Paperless)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Change Description & Rationale Bento Sub-Boxes */}
          <div className="card-surface p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <h3 className="font-semibold text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={14} strokeWidth={1.5} className="text-amber-500" /> เนื้อหาการเปลี่ยนแปลง (Change Description & Rationale)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0 w-full">
              {/* Box 1: เหตุผลในการร้องขอ/แก้ไข */}
              <div className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-4 transition-all shadow-2xs flex flex-col justify-between min-w-0 w-full overflow-hidden">
                <div className="min-w-0 w-full">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText size={13} strokeWidth={1.5} className="text-amber-600 shrink-0" />
                    <span className="truncate">{getDarReason(dar).title}</span>
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-800 font-normal leading-relaxed break-words [overflow-wrap:anywhere] break-all whitespace-pre-wrap pl-0.5">
                    {getDarReason(dar).value}
                  </p>
                </div>
              </div>

              {/* Box 2: รายละเอียดการเปลี่ยนแปลง */}
              <div className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-4 transition-all shadow-2xs flex flex-col justify-between min-w-0 w-full overflow-hidden">
                <div className="min-w-0 w-full">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles size={13} strokeWidth={1.5} className="text-amber-500 shrink-0" />
                    <span className="truncate">{getDarDetail(dar).title}</span>
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-800 font-normal leading-relaxed break-words [overflow-wrap:anywhere] break-all whitespace-pre-wrap pl-0.5">
                    {getDarDetail(dar).value}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Compact Minimalist Attachment Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 hover:border-slate-300 transition-all">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                <FileText size={18} strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs sm:text-sm font-semibold text-slate-800 truncate font-mono" title={fileName}>
                    {fileName}
                  </p>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                    {dar.attachedFile ? (dar.attachedFile.type?.includes('pdf') ? 'PDF' : 'IMG') : 'PDF'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                  เอกสารแนบประกอบคำร้อง DAR · {fileSize}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isApiMode && dar.apiStatus === 'PENDING_REVIEW' && isDarRequester(dar, currentUser) && (
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium cursor-pointer shadow-2xs focus-within:ring-2 focus-within:ring-blue-500/30">
                  <Upload size={13} strokeWidth={1.5} className="text-slate-500" />
                  <span>{dar.attachedFile ? 'เปลี่ยนไฟล์' : 'แนบไฟล์ PDF'}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) replaceDarFile(dar, file);
                    }}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={handleDownloadAttachment}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium transition-all cursor-pointer shadow-2xs"
                title="ดาวน์โหลดไฟล์ PDF ที่ประทับตราแล้ว"
              >
                <Download size={13} strokeWidth={1.5} className="text-slate-500" />
                <span className="hidden sm:inline">ดาวน์โหลด (Watermark)</span>
              </button>
              <button
                type="button"
                onClick={handlePreviewAttachment}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-medium shadow-xs transition-all cursor-pointer"
                title="เปิดดูไฟล์ต้นฉบับ"
              >
                <ExternalLink size={13} strokeWidth={1.5} />
                <span>เปิดดูไฟล์ต้นฉบับ</span>
              </button>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Audit Activity & Conversation Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Top: Audit Activity Workflow Timeline with FIXED Header */}
          <div className="card-surface rounded-2xl border border-slate-200/90 shadow-xs flex flex-col h-[320px] overflow-hidden">
            {/* 1. Fixed Header (OUTSIDE scroll container to prevent overlap) */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <History size={15} strokeWidth={1.5} className="text-slate-500" />
                <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-800">
                  ประวัติการดำเนินการ (Activity Log)
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                {myTimeline.length} รายการ
              </span>
            </div>

            {/* 2. Scrollable Timeline List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-white">
              {myTimeline.map((item) => (
                <div key={item.id} className="relative pl-5 border-l-2 border-slate-100 last:border-0 pb-1">
                  <div className="absolute -left-[7px] top-0 bg-white p-0.5 rounded-full">
                    <CheckCircle className="text-slate-400" size={13} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="flex justify-between items-start mb-0.5 gap-2">
                      <p className="font-semibold text-slate-800 text-xs truncate">{item.action}</p>
                      <p className="text-[10px] text-slate-400 font-mono shrink-0">{item.date}</p>
                    </div>
                    <p className="text-xs text-slate-500">โดย: <span className="font-medium text-slate-800">{item.user}</span></p>
                    {item.comment && !item.isChat && (
                      <p className="text-xs text-slate-700 mt-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200/70 leading-relaxed break-words">
                        {item.comment}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {myTimeline.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">ไม่มีบันทึกการดำเนินการเพิ่มเติม</p>
              )}
            </div>
          </div>

          {/* Bottom: Retained & Scoped Comments Chat Widget */}
          <DARComments darId={dar.id} requesterId={dar.requesterId} dar={dar} />

        </div>

      </div>

      {/* 6-Dimension Inspector Modal */}
      <DarReviewModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        dar={dar}
        role="VIEWER"
        readOnly={true}
      />

      {/* Real File Viewer Modal */}
      <FileViewerModal 
        isOpen={isFileViewerOpen} 
        onClose={() => setIsFileViewerOpen(false)} 
        attachedFile={dar.attachedFile} 
      />
    </div>
  );
};

export default DarDetail;

