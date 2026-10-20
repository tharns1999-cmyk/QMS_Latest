import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { normalizeDepartmentId } from '../../services/MasterDataService';
import toast from 'react-hot-toast';
import { FileText, CheckCircle, ChevronLeft, Eye, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { getDarReason, getDarDetail, getDarDocInfo } from '../../utils/darHelper';

const TaskAck = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { masterDepartments, tasks, dars, documents, currentUser, processWorkflow } = useStore();
  const [hasOpenedPdf, setHasOpenedPdf] = useState(false);

  const task = tasks.find(t => t.id === id);
  let dar = task ? dars.find(d => d.id === task.darId) : null;
  if (!dar && task?.docId) {
    const doc = (documents || []).find(d => d.id === task.docId || d.title === task.docId);
    if (doc) {
      dar = {
        id: doc.id,
        title: doc.title,
        name: doc.name,
        rev: doc.rev || '01',
        type: doc.type || 'SOP',
        effectiveDate: doc.effectiveDate,
        department: doc.department,
        status: doc.status || 'EFFECTIVE',
        file: `${doc.title}.pdf`,
        requestReason: 'การประกาศใช้เอกสารใหม่ในระบบ QMS',
        requestDetail: `ขอให้พนักงานและผู้เกี่ยวข้องรับทราบแนวปฏิบัติตาม ${doc.title} (${doc.name})`
      };
    }
  }

  if (!task || !dar) {
    return <div className="p-6 text-[#666666] font-medium">ไม่พบรายการงานที่ระบุ</div>;
  }

  if (task.assigneeId !== currentUser.id) {
    return <div className="p-6 text-rose-600 font-medium">คุณไม่มีสิทธิ์เข้าถึงงานนี้</div>;
  }

  const handleOpenPdf = () => {
    toast.success('กำลังเปิดไฟล์ PDF...');
    setHasOpenedPdf(true);
  };

  const handleAction = () => {
    if (!hasOpenedPdf) {
      toast.error('กรุณาเปิดอ่านไฟล์ PDF ก่อนกดยืนยันรับทราบ');
      return;
    }
    processWorkflow(task.id, 'ACKNOWLEDGE', 'Acknowledged');
    toast.success('ยืนยันการรับทราบเอกสารสำเร็จ');
    navigate('/tasks');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.2 }} 
      className="max-w-4xl mx-auto space-y-6 pb-12 w-full max-w-full overflow-hidden"
    >
      <button onClick={() => navigate('/tasks')} className="flex items-center text-xs font-bold text-slate-600 hover:text-[#0D99FF] transition-colors">
        <ChevronLeft size={16} /> กลับหน้า Inbox
      </button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#E5F4FF] text-[#0D99FF] flex items-center justify-center shadow-xs">
          <FileText size={22} strokeWidth={1.75}/>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#1E1E1E] tracking-tight">รับทราบการประกาศใช้เอกสาร: <span className="font-mono text-[#0D99FF]">{dar.id}</span></h2>
          <p className="text-xs text-[#666666] mt-0.5">การรับทราบข้อกำหนดและการเปลี่ยนแปลงเอกสารคุณภาพตามมาตรฐาน</p>
        </div>
      </div>

      <div className="card-surface p-5 bg-[#E5F4FF]/60 border-[#E5F4FF] flex items-start gap-4">
        <div className="bg-indigo-100 p-2.5 rounded-xl text-[#0D99FF] shrink-0">
          <Eye size={22} strokeWidth={1.75}/>
        </div>
        <div>
          <h3 className="font-bold text-sm text-indigo-950 mb-1">การรับทราบเอกสาร (Acknowledgement Protocol)</h3>
          <p className="text-indigo-800 text-xs leading-relaxed">
            คุณได้รับมอบหมายให้รับทราบเนื้อหาและแนวปฏิบัติของเอกสารฉบับนี้ กรุณากดเปิดอ่านไฟล์ PDF เพื่อศึกษาเนื้อหาก่อนกดยืนยันการรับทราบ
          </p>
        </div>
      </div>

      <div className="card-surface p-6 space-y-6">
        <h3 className="font-bold text-sm text-[#1E1E1E] border-b border-slate-100 pb-2">ข้อมูลคำร้องเอกสาร (DAR Information)</h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs p-4 bg-[#F5F5F5] rounded-xl border border-slate-100">
          <div><span className="text-slate-400 block mb-0.5">รหัสเอกสาร:</span> <span className="font-mono font-bold text-[#007BE5]">{getDarDocInfo(dar, documents).docCode}</span></div>
          <div><span className="text-slate-400 block mb-0.5">ฉบับที่ (Rev.):</span> <span className="font-mono font-bold text-slate-800">{getDarDocInfo(dar, documents).docRev}</span></div>
          <div><span className="text-slate-400 block mb-0.5">ประเภท:</span> <span className="font-bold text-slate-800">{getDarDocInfo(dar, documents).docType}</span></div>
          <div><span className="text-slate-400 block mb-0.5">วันบังคับใช้:</span> <span className="font-mono text-slate-800">{dar.effectiveDate || '-'}</span></div>
          <div><span className="text-slate-400 block mb-0.5">แผนกเจ้าของ:</span> <span className="font-bold font-mono text-slate-800">{(() => { const d = normalizeDepartmentId(dar.department); const dObj = masterDepartments.find(md => normalizeDepartmentId(md.id) === d); return dObj ? `${d} - ${dObj.nameTh || dObj.name}` : (d || '-'); })()}</span></div>
          <div><span className="text-slate-400 block mb-0.5">สถานะ:</span> <span className="badge-active">{dar.status}</span></div>
        </div>
        
        <div className="pt-2.5 border-t border-slate-100 space-y-2 text-xs">
          <div className="grid grid-cols-[100px_1fr] gap-2 items-start min-w-0">
            <span className="text-slate-500 font-bold shrink-0">
              {getDarReason(dar).title}:
            </span>
            <div className="min-w-0 text-slate-800 font-normal leading-relaxed break-words break-all whitespace-pre-wrap [overflow-wrap:anywhere] bg-[#F5F5F5] border border-slate-200/70 rounded-lg p-2">
              {getDarReason(dar).value}
            </div>
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-2 items-start min-w-0">
            <span className="text-slate-500 font-bold shrink-0">
              {getDarDetail(dar).title}:
            </span>
            <div className="min-w-0 text-slate-800 font-normal leading-relaxed break-words break-all whitespace-pre-wrap [overflow-wrap:anywhere] bg-[#F5F5F5] border border-slate-200/70 rounded-lg p-2">
              {getDarDetail(dar).value}
            </div>
          </div>
        </div>

        <div className="bg-[#F5F5F5] p-6 rounded-xl border border-[#E5E5E5]/80 text-center space-y-4">
          <FileText className="text-slate-400 mx-auto" size={40} strokeWidth={1.5}/>
          <div>
            <p className="font-bold text-slate-800 text-sm">{dar.file || `${dar.title}.pdf`}</p>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">PDF Document</p>
          </div>
          <button 
            onClick={handleOpenPdf}
            className="btn-secondary text-xs inline-flex items-center gap-2 px-5 py-2 border-[#E5F4FF] text-[#007BE5] hover:bg-[#E5F4FF]"
          >
            <Download size={16} /> เปิดอ่านไฟล์ (Read Document)
          </button>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <button
            onClick={handleAction}
            disabled={!hasOpenedPdf}
            className={`w-full py-3 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-xs text-xs ${
              hasOpenedPdf 
                ? 'btn-primary justify-center' 
                : 'bg-[#F5F5F5] text-slate-400 cursor-not-allowed'
            }`}
          >
            <CheckCircle size={16} /> ยืนยันการรับทราบ (Acknowledge)
          </button>
          {!hasOpenedPdf && (
            <p className="text-center text-xs text-rose-500 mt-2 font-medium">
              * กรุณากดเปิดอ่านไฟล์เอกสารด้านบนก่อนกดยืนยันการรับทราบ
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default TaskAck;
