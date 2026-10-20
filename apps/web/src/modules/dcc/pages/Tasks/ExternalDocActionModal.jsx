import React, { useState, useMemo, useEffect } from "react";
import {
  X, Check, XCircle, FileText, ShieldCheck, Eye, Bell,
  Clock, AlertCircle, AlertTriangle,
  Building2, Globe, Calendar, MapPin,
  Printer, RotateCcw, FileCheck, ChevronRight,
  MessageSquare, Activity
} from "lucide-react";
import useStore from "../../../../store/useStore";
import { motion } from "framer-motion";
import ExternalDocPreviewModal from "../ExternalDocs/ExternalDocPreviewModal";
import ActionConfirmModal from "../../../../shared/components/common/ActionConfirmModal";
import { toast } from "react-hot-toast";


const fmtDate = (d) => {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
  } catch { return String(d); }
};

const fmtDateTime = (d) => {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return String(d); }
};

const StatusBadge = ({ status }) => {
  const map = {
    PENDING_EXT_REVIEW:   { label: "รอทบทวน",    cls: "bg-amber-50 text-amber-700 border-amber-300" },
    PENDING_EXT_APPROVAL: { label: "รออนุมัติ",   cls: "bg-indigo-50 text-indigo-700 border-indigo-300" },
    REVISE_REQUESTED:     { label: "รอแก้ไข",     cls: "bg-orange-50 text-orange-700 border-orange-400" },
    ACTIVE:               { label: "ใช้งาน",      cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
    EFFECTIVE:            { label: "ใช้งาน",      cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
    APPROVED:             { label: "อนุมัติแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
    REJECTED:             { label: "ไม่อนุมัติ",  cls: "bg-rose-50 text-rose-700 border-rose-300" },
    OBSOLETE:             { label: "ยกเลิกแล้ว",  cls: "bg-slate-100 text-slate-500 border-slate-300" },
  };
  const { label, cls } = map[status] || { label: status || "กำลังดำเนินการ", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${cls}`}>{label}</span>;
};

const TypeBadge = ({ type }) => {
  const map = {
    REVISION: { label: "ปรับปรุงฉบับ", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: RotateCcw },
    UPDATE:   { label: "ปรับปรุงฉบับ", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: RotateCcw },
    OBSOLETE: { label: "ขอยกเลิก",    cls: "bg-rose-50 text-rose-700 border-rose-200",     Icon: XCircle },
    NEW:      { label: "ขอขึ้นทะเบียน",cls: "bg-blue-50 text-blue-700 border-blue-200",    Icon: FileCheck },
  };
  const { label, cls, Icon } = map[type] || map["NEW"];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${cls}`}>
      <Icon size={11} /> {label}
    </span>
  );
};

const TimelineNode = ({ item, isLast }) => {
  const isDone    = item.status === "COMPLETED";
  const isCurrent = item.status === "PENDING";
  const isRet     = item.status === "RETURNED" || item.status === "REJECTED";
  return (
    <div className="relative flex items-start gap-3 text-xs">
      {!isLast && <div className="absolute left-2.5 top-6 bottom-0 w-px bg-slate-200 z-0" />}
      <div className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isDone ? "bg-emerald-500 text-white" :
        isRet ? "bg-rose-500 text-white" :
        isCurrent ? "bg-amber-400 text-slate-900 ring-2 ring-amber-100 animate-pulse" :
        "bg-slate-200 text-slate-400"
      }`}>
        {isDone ? <Check size={11} strokeWidth={3} /> :
         isRet ? <X size={11} strokeWidth={3} /> :
         isCurrent ? <Clock size={11} /> :
         <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />}
      </div>
      <div className="flex-1 pb-3 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-slate-800 text-xs">{item.stepName || item.step}</span>
          <span className="text-[10px] font-mono text-slate-400 shrink-0">{item.date ? fmtDateTime(item.date) : "รอดำเนินการ"}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
          โดย: <span className="font-semibold text-slate-700">{item.userName || "-"}</span>
          {item.userRole && <span className="text-slate-400 ml-1">({item.userRole})</span>}
        </p>
        {item.comment && (
          <p className="text-xs text-slate-600 bg-slate-50/80 px-3 py-1.5 rounded-lg border border-slate-100 mt-1.5 leading-relaxed italic break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
            &ldquo;{item.comment}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
};

const SectionCard = ({ icon: Icon, iconCls, title, badge, action, children, className = "" }) => (
  <div className={`bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs ${className}`}>
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 gap-3">
      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 min-w-0">
        <Icon size={15} className={iconCls} />
        <span className="truncate">{title}</span>
      </h3>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200/70">
            {badge}
          </span>
        )}
        {action}
      </div>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const ExternalDocActionModal = ({ task, onClose, layoutId }) => {
  const { externalDocuments, externalRequests, processExternalTask } = useStore();
  const [comment, setComment] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [returnReasonError, setReturnReasonError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const isReview   = task.type === "EXT_REVIEW"    || task.type === "EXTERNAL_REVIEW";
  const isApproval = task.type === "EXT_APPROVAL"  || task.type === "EXTERNAL_APPROVAL";
  const isAck      = task.type === "Ack";

  const doc = useMemo(() => {
    const allDocs = externalDocuments || [];
    const allReqs = externalRequests  || [];
    let found = allDocs.find(d =>
      d.id === task.referenceId || d.edCode === task.docCode || d.doc_code === task.docCode ||
      d.edCode === task.referenceId || d.doc_code === task.referenceId
    );
    const req = allReqs.find(r =>
      r.id === task.referenceId || r.requestId === task.referenceId || r.docId === task.referenceId ||
      r.externalDocId === task.referenceId || r.edCode === task.docCode || r.edCode === task.referenceId
    );
    
    let baseDoc = null;
    if (found) {
      baseDoc = { ...found };
    } else if (req) {
      const linked = allDocs.find(d =>
        d.id === req.docId || d.id === req.externalDocId ||
        (req.edCode && (d.edCode === req.edCode || d.doc_code === req.edCode))
      );
      baseDoc = {
        ...(linked || {}), ...req,
        id: req.externalDocId || req.docId || req.id,
        edCode: req.edCode || req.doc_code || linked?.edCode,
        doc_code: req.doc_code || req.edCode || linked?.doc_code,
        title: req.title || req.docTitle || linked?.title || "เอกสารภายนอก",
        department: req.department || req.requesterDepartment || linked?.department || "QA",
        status: req.status || linked?.status || "PENDING_EXT_REVIEW",
        reviewerId: req.reviewerId || linked?.reviewerId,
        reviewerName: req.reviewerName || linked?.reviewerName,
        approverId: req.approverId || linked?.approverId,
        approverName: req.approverName || linked?.approverName,
        requesterId: req.requesterId || linked?.ownerId,
        requesterName: req.requesterName || linked?.ownerName,
        signoffs: req.signoffs || linked?.signoffs || [],
      };
    } else {
      baseDoc = { ...(task.metadata || task) };
    }

    const attachedFile = req?.attachedFile || task?.attachedFile || baseDoc.attachedFile || null;
    const fileId = req?.fileId || task?.fileId || baseDoc.fileId || attachedFile?.fileId || null;
    const fileName = req?.fileName || task?.fileName || baseDoc.fileName || attachedFile?.name || '';

    return {
      ...baseDoc,
      ...(attachedFile ? { attachedFile, file: attachedFile, attachment: attachedFile } : {}),
      ...(fileId ? { fileId } : {}),
      ...(fileName ? { fileName } : {})
    };
  }, [externalDocuments, externalRequests, task]);

  const request = useMemo(() => {
    const allReqs = externalRequests || [];
    return allReqs.find(r =>
      r.id === task.referenceId || r.requestId === task.referenceId ||
      r.docId === task.referenceId || r.externalDocId === task.referenceId ||
      (doc?.id && (r.docId === doc.id || r.externalDocId === doc.id)) ||
      (doc?.edCode && r.edCode === doc.edCode)
    ) || null;
  }, [externalRequests, task, doc]);

  const edCode    = doc?.edCode || doc?.doc_code || doc?.docNo || task.docCode || "ED-???";
  const reqCode   = request?.requestId || request?.requestNo || request?.id || `EDR-${edCode}`;
  const docTitle  = doc?.title || doc?.docTitle || task.docTitle || "เอกสารภายนอก";
  // Resilient source/issuer fallback — covers every field name used across externalDocuments, externalRequests, and task metadata
  const docSource =
    request?.issuer || request?.officialIssuer || request?.source ||
    doc?.issuer     || doc?.officialIssuer     || doc?.source ||
    doc?.sourceOrg  || doc?.externalSource     || doc?.origin ||
    request?.sourceOrg || request?.externalSource || request?.origin ||
    task?.issuer    || task?.officialIssuer    || task?.source || task?.sourceOrg ||
    "-";
  // Resilient effectiveDate fallback — externalRequests now stores this but legacy records may use alternate keys
  const docEffectiveDate =
    doc?.effectiveDate      || doc?.targetEffectiveDate || doc?.enforceDate     || doc?.effective_date ||
    request?.effectiveDate  || request?.targetEffectiveDate || request?.enforceDate ||
    task?.effectiveDate     || task?.metadata?.effectiveDate || null;
  const extActionMap = { UPDATE: "ปรับปรุงฉบับ (Update Edition)", OBSOLETE: "ขอยกเลิก (Obsolete)", REGISTER: "ขึ้นทะเบียนใหม่ (New)" };
  const actionLabel = extActionMap[task.extAction] || "ขึ้นทะเบียนใหม่ (New)";
  const controlledCopies = doc?.distributions || doc?.physical_distribution || [];

  const isRevision = ['REVISION', 'UPDATE'].includes(
    request?.type || request?.actionType || request?.extAction || task?.extAction || ''
  );

  const signoffs = useMemo(() => {
    const raw = request?.signoffs || doc?.signoffs;
    if (raw && raw.length > 0) return raw;
    const nowIso = doc?.createdAt || new Date().toISOString();
    const docStatus = doc?.status || request?.status || "PENDING_EXT_REVIEW";
    return [
      { step: "REQUEST", stepName: "ยื่นคำร้อง", role: "ผู้ยื่นคำร้อง", userName: doc?.requesterName || doc?.ownerName || request?.requesterName || "ผู้ยื่นคำร้อง", userRole: "Requester", status: "COMPLETED", date: nowIso, comment: "ยื่นคำร้องขอขึ้นทะเบียนเอกสารภายนอก" },
      { step: "REVIEW",  stepName: "ทบทวนเอกสาร", role: "ผู้ทบทวน", userName: doc?.reviewerName || request?.reviewerName || "-", userRole: "Reviewer", status: docStatus === "PENDING_EXT_REVIEW" ? "PENDING" : docStatus === "REVISE_REQUESTED" ? "RETURNED" : "COMPLETED", date: doc?.reviewedAt || request?.reviewedAt || null, comment: doc?.revisionComment || request?.revisionComment || null },
      { step: "APPROVE", stepName: "อนุมัติเอกสาร", role: "ผู้อนุมัติ", userName: doc?.approverName || request?.approverName || "-", userRole: "Approver", status: docStatus === "PENDING_EXT_APPROVAL" ? "PENDING" : ["ACTIVE","EFFECTIVE","APPROVED"].includes(docStatus) ? "COMPLETED" : docStatus === "REJECTED" ? "REJECTED" : "WAITING", date: doc?.approvedAt || request?.approvedAt || null, comment: doc?.returnReason || request?.returnReason || null },
    ];
  }, [request, doc]);

  const reqStep = signoffs.find(s => s.step === "REQUEST");
  const revStep = signoffs.find(s => s.step === "REVIEW");
  const appStep = signoffs.find(s => s.step === "APPROVE");
  const returnFeedback = request?.returnReason || request?.revisionComment || doc?.returnReason || doc?.revisionComment || null;

  const workflowSteps = useMemo(() => {
    const docStatus = doc?.status || request?.status || "PENDING_EXT_REVIEW";
    const dccStatus = ["ACTIVE", "EFFECTIVE", "APPROVED"].includes(docStatus) ? "COMPLETED" : "WAITING";
    const dccDate = ["ACTIVE", "EFFECTIVE", "APPROVED"].includes(docStatus) ? (doc?.updatedAt || request?.updatedAt) : null;
    
    return [
      {
        no: 1,
        role: "ผู้ยื่นคำร้อง",
        name: reqStep?.userName || doc?.requesterName || doc?.ownerName || "ผู้ยื่นคำร้อง",
        status: "COMPLETED",
        date: reqStep?.date || doc?.createdAt || request?.createdAt
      },
      {
        no: 2,
        role: "ผู้ทบทวน",
        name: revStep?.userName || doc?.reviewerName || request?.reviewerName || "-",
        status: revStep?.status || (docStatus === "PENDING_EXT_REVIEW" ? "PENDING" : docStatus === "REVISE_REQUESTED" ? "RETURNED" : "COMPLETED"),
        date: revStep?.date || doc?.reviewedAt || null
      },
      {
        no: 3,
        role: "ผู้อนุมัติ",
        name: appStep?.userName || doc?.approverName || request?.approverName || "-",
        status: appStep?.status || (docStatus === "PENDING_EXT_APPROVAL" ? "PENDING" : ["ACTIVE", "EFFECTIVE", "APPROVED"].includes(docStatus) ? "COMPLETED" : docStatus === "REJECTED" ? "REJECTED" : "WAITING"),
        date: appStep?.date || doc?.approvedAt || null
      },
      {
        no: 4,
        role: "งานควบคุม (DCC)",
        name: "DCC Center",
        status: dccStatus,
        date: dccDate
      }
    ];
  }, [reqStep, revStep, appStep, doc, request]);

  const handleAction = (action) => {
    if ((action === "REJECT" || action === "RETURN") && comment.trim().length < 5) {
      setReturnReasonError("กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร");
      return;
    }
    setReturnReasonError("");
    setPendingAction(action);
    setShowConfirm(true);
  };

  const executeAction = async () => {
    try {
      await processExternalTask(task.id, pendingAction, comment);
      const successMsg = pendingAction === 'APPROVE'
        ? (isReview
            ? 'ทบทวนเอกสารและส่งต่อให้ผู้อนุมัติเรียบร้อยแล้ว'
            : 'อนุมัติเอกสารภายนอกเรียบร้อยแล้ว')
        : 'ส่งกลับแก้ไขเรียบร้อยแล้ว';
      toast.success(successMsg);
      onClose();
    } catch (err) {
      console.error('executeAction error:', err);
      throw err; // re-throw so ActionConfirmModal catch block shows error toast
    } finally {
      setShowConfirm(false);
    }
  };



  const hp = isReview
    ? { bg: "from-indigo-600 to-indigo-700", badge: "bg-indigo-500/30 text-indigo-100", label: "การทบทวนเอกสารภายนอก", sub: "Review Document", Icon: Eye }
    : isApproval
    ? { bg: "from-emerald-600 to-emerald-700", badge: "bg-emerald-500/30 text-emerald-100", label: "การอนุมัติเอกสารภายนอก", sub: "Approve Document", Icon: ShieldCheck }
    : { bg: "from-sky-600 to-sky-700", badge: "bg-sky-500/30 text-sky-100", label: "รับทราบเอกสารภายนอก", sub: "Acknowledge Document", Icon: Bell };

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 lg:p-6 bg-slate-950/50 backdrop-blur-xs overflow-hidden">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0" />

      <motion.div
        layoutId={layoutId}
        initial={{ scale: 0.97, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: 16 }}
        transition={{ type: "spring", stiffness: 340, damping: 32 }}
        className="relative w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] h-[88vh] max-h-[900px] min-h-[580px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/80 z-10"
      >
        {/* HEADER */}
        <div className="bg-white border-b border-slate-100 px-6 lg:px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
               <hp.Icon size={20} className="text-slate-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-slate-800 font-bold text-base leading-tight tracking-tight">{hp.label}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">{hp.sub}</span>
                <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">{reqCode}</span>
                <span className="text-slate-300">·</span>
                <TypeBadge type={task.extAction === "UPDATE" ? "REVISION" : task.extAction || "NEW"} />
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-50 p-2 rounded-xl transition-colors shrink-0 cursor-pointer border border-transparent hover:border-slate-200" title="ปิดหน้าต่าง"><X size={20} /></button>
        </div>

        {/* COMPACT WORKFLOW STEPPER STRIP */}
        <div className="bg-slate-50/80 border-b border-slate-200/70 px-6 lg:px-8 py-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2 overflow-x-auto scrollbar-none text-xs">
            {workflowSteps.map((step, idx) => {
              const isDone = step.status === "COMPLETED";
              const isCurrent = step.status === "PENDING";
              const isRet = step.status === "RETURNED" || step.status === "REJECTED";

              return (
                <React.Fragment key={step.no}>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isDone ? "bg-emerald-500 text-white" :
                      isRet ? "bg-rose-500 text-white" :
                      isCurrent ? "bg-indigo-600 text-white ring-2 ring-indigo-200" :
                      "bg-slate-200 text-slate-500"
                    }`}>
                      {isDone ? <Check size={11} strokeWidth={3} /> :
                       isRet ? <X size={11} strokeWidth={3} /> :
                       step.no}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-bold ${isCurrent ? "text-indigo-900" : isDone ? "text-slate-800" : "text-slate-400"}`}>
                          {step.role}
                        </span>
                        {step.name && step.name !== "-" && (
                          <span className={`text-[11px] truncate max-w-[90px] sm:max-w-[130px] ${isCurrent ? "text-indigo-700 font-semibold" : "text-slate-500"}`}>
                            : {step.name}
                          </span>
                        )}
                      </div>
                      {step.date && (
                        <p className="text-[10px] text-slate-400 font-mono leading-none mt-0.5">{fmtDate(step.date)}</p>
                      )}
                    </div>
                  </div>
                  {idx < workflowSteps.length - 1 && (
                    <div className="hidden sm:block flex-1 min-w-[16px] max-w-[48px] h-px bg-slate-200" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-7 lg:p-8 bg-slate-50/40 custom-scrollbar space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COL: Target Document & Change Scope (~58% width) */}
            <div className="lg:col-span-7 space-y-5">
              <SectionCard 
                icon={FileText} 
                iconCls="text-blue-600" 
                title="ข้อมูลเอกสารและการปรับปรุง (Target Document & Change Scope)" 
                badge={edCode}
                action={
                  <button 
                    type="button" 
                    onClick={() => setIsPreviewOpen(true)} 
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
                    title="เปิดดูไฟล์เอกสาร PDF ฉบับเต็ม"
                  >
                    <Eye size={14} />
                    <span>ดูไฟล์เอกสาร PDF</span>
                  </button>
                }
              >
                <div className="space-y-4">
                  {/* Document Name Block */}
                  <div className="p-3.5 sm:p-4 bg-slate-50/70 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ชื่อเอกสาร / Document Name</p>
                    <p className="text-[15px] font-bold text-slate-900 leading-snug break-words [overflow-wrap:anywhere]">{docTitle}</p>
                  </div>

                  {/* Version Transition Strip (Change Scope Banner) */}
                  {isRevision ? (
                    <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-indigo-50/60 border border-indigo-100/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
                          <RotateCcw size={14} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800">
                            การยกระดับเวอร์ชัน
                          </span>
                          <span className="text-[11px] text-indigo-600 font-medium ml-1.5">(Version Transition)</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Original Version */}
                        <div 
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 font-mono font-semibold rounded-lg border border-slate-200 shadow-2xs text-xs"
                          title={`ฉบับเดิม: ${doc?.sourceVersion || doc?.edition || 'ฉบับแรก'}`}
                        >
                          <span className="text-[11px] text-slate-400 font-sans font-normal shrink-0">ฉบับเดิม:</span>
                          <span className="break-all font-semibold">{doc?.sourceVersion || doc?.edition || 'ฉบับแรก'}</span>
                        </div>

                        <span className="text-indigo-500 font-bold shrink-0 text-sm px-0.5">➔</span>

                        {/* New Requested Version */}
                        <div 
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white font-mono font-bold rounded-lg shadow-xs text-xs"
                          title={`ฉบับใหม่ที่ขอ: ${request?.sourceVersion || request?.edition || 'ฉบับใหม่'}`}
                        >
                          <span className="text-[11px] text-indigo-200 font-sans font-normal shrink-0">ฉบับใหม่:</span>
                          <span className="break-all text-white font-bold">{request?.sourceVersion || request?.edition || 'ฉบับใหม่'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 sm:p-4 bg-slate-50/70 border border-slate-200/60 rounded-xl flex flex-wrap items-center justify-between gap-2.5 text-xs">
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5 shrink-0">
                        <FileCheck size={14} className="text-blue-600 shrink-0" />
                        เวอร์ชันต้นทาง (Edition / Version):
                      </span>
                      <span 
                        className="font-mono font-bold text-slate-800 bg-white px-3.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs break-all"
                        title={doc?.sourceVersion || doc?.edition || request?.sourceVersion || request?.edition || 'ฉบับต้นทาง'}
                      >
                        {doc?.sourceVersion || doc?.edition || request?.sourceVersion || request?.edition || 'ฉบับต้นทาง'}
                      </span>
                    </div>
                  )}

                  {/* Clean Metadata Panel (No inner box borders) */}
                  <div className="pt-3.5 border-t border-slate-100">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-5 text-xs">
                      <div>
                        <p className="text-[11px] font-medium text-slate-400 mb-0.5">รหัสเอกสาร (ED Code)</p>
                        <p className="font-mono font-bold text-blue-600 text-xs">{edCode || "-"}</p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-slate-400 mb-0.5">แผนกเจ้าของ (Dept)</p>
                        <p className="font-semibold text-slate-800 text-xs flex items-center gap-1.5" title={doc?.department || "QA"}>
                          <Building2 size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">{doc?.department || "QA"}</span>
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-slate-400 mb-0.5">วันที่มีผลบังคับใช้</p>
                        <p className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400 shrink-0" />
                          <span>{fmtDate(docEffectiveDate) || "-"}</span>
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-slate-400 mb-0.5">แหล่งที่มา (Source)</p>
                        <p className="font-semibold text-slate-800 text-xs flex items-center gap-1.5" title={docSource}>
                          <Globe size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">{docSource || "-"}</span>
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-slate-400 mb-0.5">รอบทบทวน (Cycle)</p>
                        <p className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                          <Clock size={13} className="text-slate-400 shrink-0" />
                          <span>{doc?.reviewCycleMonths || 12} เดือน</span>
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-slate-400 mb-0.5">ระดับความลับ</p>
                        <p>
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            doc?.accessScope === "Restricted" 
                              ? "bg-rose-50 text-rose-700 border-rose-200" 
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}>
                            {doc?.accessScope || "General"}
                          </span>
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-slate-400 mb-0.5">สถานะปัจจุบัน</p>
                        <div>
                          <StatusBadge status={doc?.status || request?.status} />
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-slate-400 mb-0.5">ประเภทคำร้อง</p>
                        <div>
                          <TypeBadge type={task.extAction === "UPDATE" ? "REVISION" : task.extAction || "NEW"} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {doc?.obsoleteReason && task.extAction === "OBSOLETE" && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs">
                      <p className="font-bold text-rose-700 mb-1 flex items-center gap-1.5"><AlertTriangle size={13} /> เหตุผลที่ขอยกเลิก</p>
                      <p className="text-rose-800 leading-relaxed break-words [overflow-wrap:anywhere]">{doc.obsoleteReason}</p>
                    </div>
                  )}

                  {doc?.link && (
                    <div className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl text-xs">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ลิงก์เอกสารแนบ</p>
                      <a href={doc.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium truncate flex items-center gap-1.5"><ChevronRight size={13} /> <span className="truncate">{doc.link}</span></a>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Controlled Copies Info (Clean stream, no nested boxes) */}
              {controlledCopies.length > 0 && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Printer size={13} className="text-blue-600" /> สำเนาควบคุมฉบับพิมพ์ ({controlledCopies.length} จุด)
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">สิทธิ์เข้าถึง: {doc?.accessScope || "General"}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {controlledCopies.map((st, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-slate-50 border border-slate-200/70 font-mono text-slate-700">
                        <MapPin size={11} className="text-blue-600" />{st.locationName || st.station_name || st.name || `จุดที่ ${idx + 1}`} ({st.departmentId || st.dept || "QA"})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT COL: Action & Audit History (~42% width) */}
            <div className="lg:col-span-5 space-y-5">
              {/* TOP: Reviewer Action Workspace (Decision Comment) */}
              {!isAck && (
                <SectionCard icon={MessageSquare} iconCls="text-indigo-600" title="บันทึกผลการพิจารณา (Decision Comment)">
                  <div className="space-y-2.5">
                    <textarea
                      id="ext-action-comment"
                      value={comment}
                      onChange={(e) => { setComment(e.target.value); if (returnReasonError) setReturnReasonError(""); }}
                      placeholder="ระบุเหตุผล ข้อเสนอแนะ หรือสิ่งที่ต้องปรับปรุงเพิ่มเติม..."
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all outline-hidden resize-none min-h-[108px]"
                    />
                    {returnReasonError && (
                      <p className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                        <AlertCircle size={13} /> {returnReasonError}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400">* หากต้องการส่งกลับแก้ไข กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร</p>
                  </div>
                </SectionCard>
              )}

              {/* CONDITIONAL: Previous Feedback (Rendered ONLY if returnFeedback exists, NO empty card) */}
              {returnFeedback && (
                <div className="p-4 bg-orange-50/90 border border-orange-200/90 rounded-2xl space-y-1.5 text-xs shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-orange-800">
                    <AlertTriangle size={14} className="text-orange-600 shrink-0" />
                    <span>บันทึกจากผู้ตรวจสอบก่อนหน้า:</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed pl-5 italic break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                    &ldquo;{returnFeedback}&rdquo;
                  </p>
                  <p className="text-slate-400 pl-5 text-[11px]">
                    โดย: {doc?.reviewerName || doc?.approverName || request?.reviewerName || request?.approverName || "ผู้มีอำนาจลงนาม"}
                  </p>
                </div>
              )}

              {/* BOTTOM: Minimal Activity Log */}
              <SectionCard icon={Activity} iconCls="text-blue-600" title="บันทึกกิจกรรม (Activity Log)" badge={`${signoffs.length} รายการ`}>
                <div className="space-y-1 pt-1">
                  {signoffs.map((item, idx) => (
                    <TimelineNode key={idx} item={item} isLast={idx === signoffs.length - 1} />
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="shrink-0 px-6 lg:px-8 py-4 bg-white border-t border-slate-200/80 flex items-center justify-between">
          <button 
            type="button" 
            onClick={onClose} 
            className="inline-flex items-center h-9 px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-transparent hover:bg-slate-100/80 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            ยกเลิก (Cancel)
          </button>
          <div className="flex items-center gap-3">
            {isAck ? (
              <button 
                type="button" 
                onClick={() => handleAction("APPROVE")} 
                className="inline-flex items-center gap-1.5 h-9 px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap"
              >
                <Bell size={14} /> 
                <span>รับทราบ (Acknowledge)</span>
              </button>
            ) : (
              <>
                <button 
                  type="button" 
                  onClick={() => handleAction("RETURN")} 
                  className="inline-flex items-center gap-1.5 h-9 px-4 py-2 rounded-xl text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100/80 border border-amber-200 active:bg-amber-200/60 transition-all whitespace-nowrap shadow-2xs cursor-pointer"
                >
                  <RotateCcw size={14} /> 
                  <span>ส่งกลับแก้ไข (Return)</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => handleAction("APPROVE")} 
                  className={`inline-flex items-center gap-1.5 h-9 px-5 py-2 rounded-xl text-xs font-semibold text-white shadow-xs transition-all cursor-pointer whitespace-nowrap ${
                    isReview 
                      ? "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-indigo-600/20" 
                      : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/20"
                  }`}
                >
                  <Check size={15} />
                  <span>{isReview ? "ยืนยันผลการทบทวน (Submit Review)" : "อนุมัติ (Approve)"}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      <ExternalDocPreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} document={doc} />

      <ActionConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={executeAction}
        title={pendingAction === "APPROVE" ? (isAck ? "ยืนยันการรับทราบเอกสารภายนอก" : isReview ? "ยืนยันผลการทบทวนเอกสารภายนอก" : "ยืนยันการอนุมัติเอกสารภายนอก") : "ยืนยันการส่งกลับแก้ไข (Return for Revision)"}
        actionType={pendingAction === "APPROVE" ? "approve" : "reject"}
        confirmText={pendingAction === "APPROVE" ? (isAck ? "รับทราบและยอมรับ" : isReview ? "ยืนยันผลการทบทวน (Submit Review)" : "ยืนยันการอนุมัติ (Approve)") : "ส่งกลับแก้ไข (Return for Revision)"}
        cancelText="ยกเลิก / กลับไปตรวจสอบ"
        summaryData={[
          { label: "รหัสคำร้อง",         value: reqCode },
          { label: "ชื่อเอกสาร",         value: docTitle },
          {
            label: "ฉบับที่ (Edition)",
            value: isRevision ? (
              <div className="flex flex-wrap items-center gap-2 font-mono text-sm font-bold">
                <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md border border-slate-200 break-all">
                  {doc?.sourceVersion || doc?.edition || 'ฉบับเดิม'}
                </span>
                <span className="text-slate-400 font-sans">➔</span>
                <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-md border border-blue-200 font-bold break-all">
                  {request?.sourceVersion || request?.edition || 'ฉบับใหม่'}
                </span>
              </div>
            ) : (
              <span className="font-mono font-bold text-slate-800 break-all">
                {doc?.sourceVersion || doc?.edition || request?.sourceVersion || request?.edition || 'ฉบับต้นทาง'}
              </span>
            )
          },
          { label: "แหล่งที่มา",         value: docSource },
          { label: "วันที่มีผลบังคับ", value: fmtDate(docEffectiveDate) || "-" },
          { label: "ประเภทคำร้อง",      value: actionLabel },
          { label: "ความเห็นประกอบ",    value: comment || "-" },
          { label: "การดำเนินการ",      value: pendingAction === "APPROVE" ? (isAck ? "รับทราบเอกสาร (Acknowledged)" : isReview ? "ผ่านการทบทวน (Reviewed & Verified)" : "อนุมัติเอกสาร (Approved)") : "ส่งกลับแก้ไข (Return for Revision)" }
        ]}
      />
    </div>
  );
};

export default ExternalDocActionModal;
