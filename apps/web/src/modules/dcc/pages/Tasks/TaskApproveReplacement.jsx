import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { motion } from 'framer-motion';
import { FilePlus, CheckCircle, XCircle, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';

const TaskApproveCopyRequest = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tasks, controlledCopyInstances, approveCcReplacement, rejectCcReplacement } = useStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const task = tasks.find(t => t.id === id);
  const instance = task ? controlledCopyInstances.find(i => i.id === task.instanceId) : null;

  if (!task || !instance) {
    return (
      <div className="flex flex-col items-center justify-center h-64 card-surface p-8 text-center max-w-md mx-auto">
        <p className="text-[#666666] text-xs mb-4">ไม่พบงาน หรือคำขอเบิกสำเนาทดแทนอาจถูกดำเนินการไปแล้ว</p>
        <button onClick={() => navigate('/tasks')} className="btn-secondary text-xs">กลับไปยังกล่องงาน Inbox</button>
      </div>
    );
  }

  const handleAction = async (action) => {
    if (action === 'REJECT' && !showRejectBox) {
      setShowRejectBox(true);
      return;
    }
    if (action === 'REJECT' && !rejectReason) {
      toast.error('กรุณาระบุเหตุผลในการปฏิเสธ');
      return;
    }

    setIsSubmitting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      
      if (action === 'APPROVE') {
        approveCcReplacement(task.id);
      } else {
        rejectCcReplacement(task.id, rejectReason);
      }
      
      toast.success(action === 'APPROVE' ? 'อนุมัติคำขอสำเร็จ' : 'ปฏิเสธคำขอสำเร็จ');
      navigate('/tasks');
    } catch {
      toast.error('เกิดข้อผิดพลาดในการทำรายการ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6 pb-12 w-full max-w-full overflow-hidden"
    >
      <button 
        onClick={() => navigate('/tasks')}
        className="flex items-center text-xs font-bold text-slate-600 hover:text-[#0D99FF] transition-colors"
      >
        <ChevronLeft size={16} /> กลับไปยังกล่องงาน
      </button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#E5F4FF] text-[#0D99FF] flex items-center justify-center shadow-xs">
          <FilePlus size={22} strokeWidth={1.75}/>
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1E1E1E] tracking-tight">อนุมัติคำขอทดแทนเอกสารควบคุม</h1>
          <p className="text-xs text-[#666666] mt-0.5">พิจารณาคำขอเอกสารชำรุด/สูญหายจากแผนกผู้ถือครอง</p>
        </div>
      </div>

      <div className="card-surface p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="p-2.5 bg-[#E5F4FF] text-[#0D99FF] rounded-xl">
            <FilePlus size={22} strokeWidth={1.75}/>
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1E1E1E]">{instance.docTitle}</h2>
            <p className="text-slate-400 text-xs font-mono">หมายเลขสำเนา: {instance.ccNumber}</p>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-slate-400 font-bold">ผู้ขอเบิก:</div>
            <div className="col-span-2 font-medium text-[#1E1E1E]">{instance.reportRequesterName}</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-slate-400 font-bold">แผนก:</div>
            <div className="col-span-2 font-medium text-[#1E1E1E] font-mono">{instance.department}</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-slate-400 font-bold">ประเภทการแจ้ง:</div>
            <div className="col-span-2 font-medium text-[#1E1E1E]">
              {instance.reportType === 'DAMAGED' ? 'เอกสารชำรุด (Damaged)' : 'เอกสารสูญหาย (Lost)'}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-slate-400 font-bold">เหตุผล / รายละเอียด:</div>
            <div className="col-span-2 font-medium text-slate-800 bg-[#F5F5F5] p-3 rounded-xl border border-slate-100">{instance.reportReason}</div>
          </div>
        </div>

        {showRejectBox && (
          <div className="mt-4 p-4 bg-rose-50 rounded-xl border border-rose-200">
            <label className="block text-xs font-bold text-rose-900 mb-1.5">เหตุผลที่ปฏิเสธ (Reject Reason) *</label>
            <textarea
              className="w-full input-primary text-xs bg-white"
              rows="3"
              placeholder="ระบุเหตุผลที่ปฏิเสธคำขอ..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex justify-end gap-2.5">
          <button 
            onClick={() => handleAction('REJECT')}
            disabled={isSubmitting}
            className="btn-secondary border-rose-200 text-rose-700 hover:bg-rose-50 text-xs px-4 py-2 disabled:opacity-50"
          >
            <XCircle size={15} /> ปฏิเสธ (Reject)
          </button>
          <button 
            onClick={() => handleAction('APPROVE')}
            disabled={isSubmitting}
            className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs px-4 py-2 disabled:opacity-50"
          >
            <CheckCircle size={15} /> อนุมัติ (Approve)
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default TaskApproveCopyRequest;
