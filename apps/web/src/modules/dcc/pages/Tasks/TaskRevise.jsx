import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import toast from 'react-hot-toast';
import { 
  CheckCircle, 
  ChevronLeft, 
  AlertCircle, 
  ExternalLink, 
  FileEdit, 
  Clock, 
  User, 
  ShieldAlert 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { isApiMode } from '../../../../api/client';
import ExternalDocFormModal from '../ExternalDocs/ExternalDocFormModal';
import { resubmitDarOnApi, withdrawDarOnApi } from '../../../../api/dars';

const TaskRevise = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tasks, dars, darRequests, timeline, resubmitDar, currentUser, externalRequests } = useStore();
  
  const rawId = String(id || '').trim();
  const allTasks = tasks || [];
  const allDars = dars || darRequests || [];

  // 1. Loose-type match on task.id
  let task = allTasks.find(t => t && String(t.id).trim() === rawId);

  // 2. Cross-field fallback search on task (task.darId, referenceId, darNo, docId, docCode)
  if (!task) {
    task = allTasks.find(t => 
      t && 
      (String(t.type || t.taskType || '').toUpperCase() === 'REVISE' || t.status === 'RETURNED_FOR_REVISION') &&
      (String(t.darId || '').trim() === rawId ||
       String(t.referenceId || '').trim() === rawId ||
       String(t.darNo || '').trim() === rawId ||
       String(t.docId || '').trim() === rawId ||
       String(t.docCode || '').trim() === rawId)
    );
  }

  if (!task) {
    task = allTasks.find(t => 
      t && 
      (String(t.darId || '').trim() === rawId ||
       String(t.referenceId || '').trim() === rawId ||
       String(t.darNo || '').trim() === rawId ||
       String(t.docId || '').trim() === rawId ||
       String(t.docCode || '').trim() === rawId)
    );
  }

  // 3. Resolve DAR (using task.darId, task.referenceId, task.darNo, or rawId)
  const candidateDarIds = [
    task?.darId,
    task?.referenceId,
    task?.darNo,
    task?.docId,
    rawId
  ].filter(Boolean).map(v => String(v).trim());

  let dar = allDars.find(d => 
    d && (
      candidateDarIds.includes(String(d.id).trim()) ||
      (d.dar_no && candidateDarIds.includes(String(d.dar_no).trim())) ||
      (d.darNo && candidateDarIds.includes(String(d.darNo).trim())) ||
      (d.doc_number && candidateDarIds.includes(String(d.doc_number).trim())) ||
      (d.title && candidateDarIds.includes(String(d.title).trim()))
    )
  );

  // 4. Cross-resolution: If task was not found yet, but we resolved dar, find matching task from dar
  if (!task && dar) {
    const dId = String(dar.id).trim();
    const dNo = String(dar.dar_no || dar.darNo || '').trim();
    task = allTasks.find(t => 
      t && (
        String(t.type || t.taskType || '').toUpperCase() === 'REVISE' &&
        (String(t.darId || '').trim() === dId || 
         String(t.referenceId || '').trim() === dId || 
         (dNo && String(t.darNo || '').trim() === dNo))
      )
    ) || allTasks.find(t => 
      t && (
        String(t.darId || '').trim() === dId || 
        String(t.referenceId || '').trim() === dId || 
        (dNo && String(t.darNo || '').trim() === dNo)
      )
    );
  }

  // 5. Fallback virtual task if dar is found but task entry is missing in store
  if (!task && dar) {
    task = {
      id: `task-revise-fallback-${dar.id}`,
      darId: dar.id,
      referenceId: dar.id,
      assigneeId: dar.requesterId || currentUser?.id,
      type: 'REVISE',
      title: `[DAR ส่งกลับแก้ไข] ${dar.title || dar.name || dar.dar_no || dar.id}`,
      returnReason: dar.returnReason || dar.rejectReason || dar.comment || dar.reviewComment || dar.approvalComment
    };
  }

  // External requests are not in `dars`; the revise page builds what it needs from the request.
  if (!dar && isApiMode && task?.darId) {
    const req = (externalRequests || []).find((r) => r.darId === String(task.darId));
    if (req) dar = { apiId: Number(task.darId), darNumber: req.requestNo, doc_code: req.documentCode || req.doc_code, name: req.title, reason: req.reason, effective_date: req.effectiveDate, type: req.requestType, file_key: req.apiFilePath ? 'attached' : null };
  }

  const resolvedDar = useMemo(() => {
    return dar || (task ? {
      id: task.darId || task.referenceId || rawId,
      title: task.docTitle || task.title || 'คำร้อง DAR',
      type: 'REVISION',
      status: 'RETURNED_FOR_REVISION'
    } : null);
  }, [dar, task, rawId]);

  // Memoised: the form re-hydrates whenever documentToEdit changes identity, so a fresh object each render would loop.
  const externalRevision = useMemo(() => {
    if (!isApiMode || task?.origin !== 'EXTERNAL' || !task?.darId) return null;
    const req = (externalRequests || []).find((r) => r.darId === String(task.darId));
    return req ? { ...req, id: req.docId, returnReason: task.returnReason || req.returnReason } : null;
  }, [externalRequests, task]);

  const [formData, setFormData] = useState({
    title: resolvedDar?.title || '',
    requestDetail: resolvedDar?.requestDetail || '',
    changeSummary: resolvedDar?.changeSummary || '',
  });

  // Keep formData in sync when resolvedDar loads
  useEffect(() => {
    if (resolvedDar) {
      setFormData(prev => ({
        title: prev.title || resolvedDar.title || resolvedDar.name || '',
        requestDetail: prev.requestDetail || resolvedDar.requestDetail || resolvedDar.reason || '',
        changeSummary: prev.changeSummary || resolvedDar.changeSummary || resolvedDar.reasonDetails || resolvedDar.change_summary || '',
      }));
    }
  }, [resolvedDar]);

  // A returned external request needs the full external-document form, not the short DAR one.
  if (externalRevision) {
    return (
      <ExternalDocFormModal
        isOpen
        onClose={() => navigate('/dcc/tasks')}
        documentToEdit={externalRevision}
        resubmitTaskId={task.id}
      />
    );
  }

  if (!task && !resolvedDar) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
          <AlertCircle size={28} />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800">ไม่พบรายการงานที่ระบุ</h3>
          <p className="text-xs text-slate-500 mt-1">
            ไม่พบงานหรือคำร้องรหัส &quot;{id}&quot; ในระบบ อาจถูกดำเนินการแล้วหรือไม่มีอยู่ในระบบ
          </p>
        </div>
        <button
          onClick={() => navigate('/dcc/tasks')}
          className="btn-primary text-xs mx-auto"
        >
          <ChevronLeft size={14} /> กลับไปยังกล่องงาน (Inbox)
        </button>
      </div>
    );
  }

  // Loose-type authorized check
  const isAuthorized = 
    !task || 
    !task.assigneeId || 
    String(task.assigneeId).trim() === String(currentUser?.id).trim() || 
    String(resolvedDar?.requesterId || '').trim() === String(currentUser?.id).trim() ||
    currentUser?.role === 'ADMIN' || 
    currentUser?.role === 'DCC_ADMIN' ||
    currentUser?.isDcc;

  if (!isAuthorized) {
    return (
      <div className="max-w-md mx-auto my-12 card-surface p-8 text-center space-y-3 border-rose-200">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert size={28} />
        </div>
        <h3 className="text-base font-bold text-slate-800">คุณไม่มีสิทธิ์เข้าถึงงานนี้</h3>
        <p className="text-xs text-slate-500">
          งานแก้ไขคำร้องนี้ถูกมอบหมายให้ผู้ยื่นคำร้องหลักดำเนินการเท่านั้น
        </p>
        <button
          onClick={() => navigate('/dcc/tasks')}
          className="btn-primary text-xs mx-auto mt-2"
        >
          <ChevronLeft size={14} /> กลับไปยังกล่องงาน
        </button>
      </div>
    );
  }

  // Retrieve reviewer/approver return reason & author
  const darTimeline = (timeline || []).filter(t => 
    t && (String(t.darId).trim() === String(resolvedDar?.id).trim() || 
         (resolvedDar?.dar_no && String(t.darId).trim() === String(resolvedDar.dar_no).trim()))
  );

  const returnedTimelineItem = darTimeline.slice().reverse().find(t => 
    t && (
      String(t.action || '').toLowerCase().includes('return') || 
      String(t.action || '').toLowerCase().includes('reject') ||
      String(t.action || '').includes('ส่งกลับ')
    ) && t.comment && t.comment !== '-'
  ) || darTimeline.slice().reverse().find(t => t && t.comment && t.comment !== '-');

  const returnReason = 
    task?.returnReason || 
    task?.rejectReason || 
    resolvedDar?.returnReason || 
    resolvedDar?.rejectReason || 
    resolvedDar?.rejectionReason || 
    resolvedDar?.reviewComment || 
    resolvedDar?.approvalComment || 
    returnedTimelineItem?.comment || 
    task?.comment ||
    'คำขอนี้ถูกส่งกลับมาให้คุณทำการแก้ไข กรุณาตรวจสอบความคิดเห็นและปรับปรุงข้อมูลให้ถูกต้อง';

  const returnAuthor = 
    task?.returnedBy || 
    task?.sender || 
    returnedTimelineItem?.user || 
    resolvedDar?.reviewerName ||
    'ผู้ทบทวน / ผู้อนุมัติ';

  const returnDate = 
    task?.returnDate || 
    returnedTimelineItem?.date || 
    resolvedDar?.updatedAt || 
    resolvedDar?.date;

  // The server keeps no draft: the requester fixes the details here and resubmits, or withdraws.
  if (isApiMode && resolvedDar?.apiId) {
    return <ApiReviseView dar={resolvedDar} returnReason={returnReason} returnAuthor={returnAuthor} returnDate={returnDate} navigate={navigate} />;
  }

  // Navigate to full DAR edit form
  const handleOpenFullForm = () => {
    let formPath = '/dcc/dar/new/document';
    const darType = String(resolvedDar?.type || resolvedDar?.doc_type || '').toUpperCase();
    if (darType === 'REVISION' || darType === 'REVISE') {
      formPath = '/dcc/dar/new/revision';
    } else if (darType === 'OBSOLETE') {
      formPath = '/dcc/dar/new/obsolete';
    }
    
    navigate(`${formPath}?draftId=${encodeURIComponent(resolvedDar.id)}`, {
      state: {
        draftId: resolvedDar.id,
        draftData: resolvedDar,
        resubmitTaskId: task?.id,
        returnReason: returnReason
      }
    });
  };

  const handleAction = () => {
    if (!formData.title?.trim()) {
      toast.error('กรุณาระบุชื่อเอกสาร');
      return;
    }
    
    resubmitDar(resolvedDar.id, formData, task?.id);
    toast.success('ส่งกลับไปให้ Reviewer ตรวจสอบใหม่สำเร็จ');
    navigate('/dcc/tasks');
  };

  const darDisplayId = resolvedDar?.dar_no || resolvedDar?.darNo || resolvedDar?.id || task?.id;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.2 }} 
      className="max-w-4xl mx-auto space-y-6 pb-12 w-full max-w-full overflow-hidden"
    >
      <button 
        onClick={() => navigate('/dcc/tasks')} 
        className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
      >
        <ChevronLeft size={16} /> กลับหน้า Inbox
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shadow-2xs shrink-0">
            <FileEdit size={22} strokeWidth={2} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">แก้ไขคำร้อง DAR</h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold border border-amber-200">
                {darDisplayId}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              แก้ไขรายละเอียดคำขอตามข้อเสนอแนะของผู้ทบทวนหรือผู้อนุมัติ
            </p>
          </div>
        </div>

        {/* Phase 3 Action: เข้าสู่หน้าแก้ไขคำร้องเต็มรูปแบบ Button in Header */}
        <button
          onClick={handleOpenFullForm}
          className="btn-secondary text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 border-indigo-200 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 transition-all shadow-2xs whitespace-nowrap self-start sm:self-auto cursor-pointer"
          title="เปิดฟอร์มคำขอเต็มเพื่อแก้ไขข้อมูลทุกส่วน"
        >
          <ExternalLink size={14} className="text-indigo-600" /> เข้าสู่หน้าแก้ไขคำร้อง
        </button>
      </div>

      {/* 🛡️ Phase 3: กล่องแสดงหมายเหตุ/เหตุผลที่ถูกส่งกลับแก้ไขอย่างชัดเจน */}
      <div className="card-surface p-5 bg-rose-50/70 border-rose-200/90 shadow-xs flex flex-col sm:flex-row items-start gap-4">
        <div className="bg-rose-100 p-2.5 rounded-xl text-rose-700 shrink-0">
          <AlertCircle size={22} strokeWidth={2} />
        </div>
        <div className="space-y-2.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-rose-950">เอกสารส่งกลับแก้ไข (Returned for Revision)</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-200/80 text-rose-900 font-extrabold uppercase tracking-wider">
                ต้องดำเนินการ
              </span>
            </div>
            {(returnAuthor || returnDate) && (
              <div className="flex items-center gap-2 text-[11px] text-rose-700 font-medium">
                {returnAuthor && (
                  <span className="flex items-center gap-1">
                    <User size={12} />
                    <span>ผู้ส่งกลับ: <strong>{returnAuthor}</strong></span>
                  </span>
                )}
                {returnDate && (
                  <span className="flex items-center gap-1 text-rose-600/80">
                    <Clock size={12} />
                    <span>{returnDate}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="bg-white/95 border border-rose-200/80 rounded-xl p-3.5 text-xs text-rose-950 font-medium leading-relaxed shadow-2xs">
            <span className="font-bold text-rose-800 block mb-1">เหตุผลและข้อเสนอแนะ:</span>
            <p className="whitespace-pre-line text-slate-800">{returnReason}</p>
          </div>
          
          <p className="text-[11px] text-rose-700 font-medium">
            * คำขอนี้ถูกส่งกลับมาให้คุณทำการแก้ไข กรุณาปรับปรุงข้อมูลตามข้อเสนอแนะด้านบน แล้วกดยื่นคำร้องใหม่อีกครั้ง
          </p>
        </div>
      </div>

      {/* 🚀 Phase 3: Bento Card แนะนำเปิดฟอร์มคำขอฉบับเต็ม */}
      <div className="card-surface p-4 sm:p-5 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 border-blue-200/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-bold text-slate-900">
              เข้าสู่หน้าแก้ไขคำร้องแบบสมบูรณ์ (Full DAR Form)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold border border-blue-200">
              แนะนำ
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
            โหลดข้อมูลเดิมของ DAR ฉบับนี้เข้าสู่ฟอร์ม เพื่อเปลี่ยนไฟล์แนบ PDF, ปรับแต่งรายชื่อผู้รับสำเนา, แก้ไขเหตุผล หรือปรับปรุงการกำหนดสิทธิ์
          </p>
        </div>
        <button
          onClick={handleOpenFullForm}
          className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xs whitespace-nowrap shrink-0 transition-transform active:scale-95 cursor-pointer"
        >
          <ExternalLink size={15} /> เข้าสู่หน้าแก้ไขคำร้อง
        </button>
      </div>

      {/* Quick Edit in Place Form */}
      <div className="card-surface p-6 space-y-5">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">แก้ไขข้อมูลคำร้องเบื้องต้น (Quick Edit)</h3>
            <p className="text-xs text-slate-500 mt-0.5">คุณสามารถปรับปรุงชื่อเอกสารหรือสรุปการเปลี่ยนแปลงได้ทันทีจากที่นี่</p>
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            ชื่อเอกสาร (Document Title) <span className="text-rose-500">*</span>
          </label>
          <input 
            type="text" 
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            className="w-full input-primary text-xs"
            placeholder="ระบุชื่อเอกสาร..."
          />
        </div>

        {resolvedDar?.type === 'NEW' && (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              รายละเอียดคำร้องขอ (Request Detail)
            </label>
            <textarea 
              rows={3}
              value={formData.requestDetail}
              onChange={(e) => setFormData({...formData, requestDetail: e.target.value})}
              className="w-full input-primary text-xs"
              placeholder="ระบุรายละเอียดเพิ่มเติม..."
            />
          </div>
        )}

        {(resolvedDar?.type === 'REVISION' || resolvedDar?.type === 'REVISE') && (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              สรุปการเปลี่ยนแปลง (Change Summary)
            </label>
            <textarea 
              rows={3}
              value={formData.changeSummary}
              onChange={(e) => setFormData({...formData, changeSummary: e.target.value})}
              className="w-full input-primary text-xs"
              placeholder="ระบุสรุปการเปลี่ยนแปลง..."
            />
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleOpenFullForm}
            className="w-full sm:w-auto btn-secondary text-xs py-2.5 px-4 justify-center"
          >
            <ExternalLink size={15} /> เข้าสู่หน้าแก้ไขคำร้อง (ฉบับเต็ม)
          </button>
          <button
            type="button"
            onClick={handleAction}
            className="w-full sm:w-auto btn-primary justify-center text-xs py-2.5 px-5"
          >
            <CheckCircle size={16} /> ส่งกลับไปทบทวนใหม่ (Resubmit for Review)
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const ApiReviseView = ({ dar, returnReason, returnAuthor, returnDate, navigate }) => {
  const isObsolete = dar.type === 'OBSOLETE';
  const [form, setForm] = useState({ name: dar.name || '', reason: dar.reason || '', effectiveDate: dar.effective_date || '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const done = (message) => {
    toast.success(message);
    navigate('/dcc/tasks');
  };
  const resubmit = async () => {
    if (!isObsolete && !form.name.trim()) return toast.error('กรุณาระบุชื่อเอกสาร');
    if (!form.reason.trim()) return toast.error('กรุณาระบุเหตุผลของคำขอ');
    if (!isObsolete && !file && !dar.file_key) return toast.error('กรุณาแนบไฟล์ PDF');
    setBusy(true);
    const ok = await resubmitDarOnApi(dar, { name: isObsolete ? undefined : form.name.trim(), reason: form.reason.trim(), effectiveDate: form.effectiveDate || undefined, file });
    setBusy(false);
    if (ok) done('ยื่นคำขอใหม่เรียบร้อยแล้ว ส่งไปให้ผู้ทบทวนอีกครั้ง');
  };
  const withdraw = async () => {
    if (!window.confirm('ยกเลิกคำขอนี้? เอกสารจะถูกปลดล็อกและต้องยื่นคำขอใหม่หากต้องการดำเนินการต่อ')) return;
    setBusy(true);
    const ok = await withdrawDarOnApi(dar);
    setBusy(false);
    if (ok) done('ยกเลิกคำขอเรียบร้อยแล้ว');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="max-w-4xl mx-auto space-y-6 pb-12 w-full max-w-full overflow-hidden">
      <button onClick={() => navigate('/dcc/tasks')} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer">
        <ChevronLeft size={16} /> กลับหน้า Inbox
      </button>

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shadow-2xs shrink-0">
          <FileEdit size={22} strokeWidth={2} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">แก้ไขคำร้อง DAR</h2>
            <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold border border-amber-200">{dar.darNumber} · {dar.doc_code}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">แก้ไขตามข้อเสนอแนะ แล้วยื่นใหม่ ระบบจะเริ่มการทบทวนตั้งแต่ต้น</p>
        </div>
      </div>

      <div className="card-surface p-5 bg-rose-50/70 border-rose-200/90 shadow-xs flex items-start gap-4">
        <div className="bg-rose-100 p-2.5 rounded-xl text-rose-700 shrink-0"><AlertCircle size={22} strokeWidth={2} /></div>
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-sm text-rose-950">ส่งกลับแก้ไข (Returned for Revision)</h3>
            <div className="flex items-center gap-3 text-[11px] text-rose-700 font-medium">
              {returnAuthor && <span className="flex items-center gap-1"><User size={12} /> ผู้ส่งกลับ: <strong>{returnAuthor}</strong></span>}
              {returnDate && <span className="flex items-center gap-1"><Clock size={12} /> {returnDate}</span>}
            </div>
          </div>
          <div className="bg-white/95 border border-rose-200/80 rounded-xl p-3.5 text-xs font-medium leading-relaxed">
            <span className="font-bold text-rose-800 block mb-1">สิ่งที่ต้องแก้ไข:</span>
            <p className="whitespace-pre-line text-slate-800">{returnReason}</p>
          </div>
        </div>
      </div>

      <div className="card-surface p-6 space-y-5">
        {!isObsolete && (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">ชื่อเอกสาร <span className="text-rose-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full input-primary text-xs" />
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">เหตุผลของคำขอ <span className="text-rose-500">*</span></label>
          <textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full input-primary text-xs" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">วันที่มีผลบังคับใช้</label>
          <input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} className="input-primary text-xs" />
        </div>
        {!isObsolete && (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">ไฟล์ PDF {dar.file_key ? '(มีไฟล์เดิมแนบอยู่ — เลือกไฟล์ใหม่ถ้าต้องการเปลี่ยน)' : '(ยังไม่ได้แนบ)'}</label>
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
        )}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button type="button" disabled={busy} onClick={withdraw} className="w-full sm:w-auto btn-secondary text-xs py-2.5 px-4 justify-center text-rose-700">ยกเลิกคำขอ</button>
          <button type="button" disabled={busy} onClick={resubmit} className="w-full sm:w-auto btn-primary justify-center text-xs py-2.5 px-5">
            <CheckCircle size={16} /> ยื่นใหม่เพื่อทบทวนอีกครั้ง
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default TaskRevise;
