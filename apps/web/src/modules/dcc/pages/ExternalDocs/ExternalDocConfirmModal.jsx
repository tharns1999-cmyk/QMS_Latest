import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  CheckCircle2, 
  Clock, 
  Shield, 
  Building2, 
  Printer, 
  Layers, 
  FileText, 
  ArrowRight, 
  Send,
  Calendar,
  Sparkles,
  Tag,
  Check
} from 'lucide-react';

/**
 * ExternalDocConfirmModal
 * Modern Bento-Grid layout for External Document Registration & Update confirmation.
 */
const ExternalDocConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  data,
  documentToEdit = null,
  currentUser = null,
  masterUsers = [],
  isResubmit = false
}) => {
  // Format Dates
  const effectiveDateFormatted = useMemo(() => {
    if (!data?.effectiveDate) return '-';
    const d = new Date(data.effectiveDate);
    if (isNaN(d.getTime())) return data.effectiveDate;
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [data?.effectiveDate]);

  const nextReviewDateFormatted = useMemo(() => {
    if (!data?.effectiveDate) return '-';
    const d = new Date(data.effectiveDate);
    if (isNaN(d.getTime())) return '-';
    d.setMonth(d.getMonth() + (Number(data.reviewCycleMonths) || 12));
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [data?.effectiveDate, data?.reviewCycleMonths]);

  // Review Cycle text
  const cycleText = useMemo(() => {
    const months = Number(data?.reviewCycleMonths) || 12;
    if (months === 12) return '12 เดือน (ประจำปี)';
    if (months === 24) return '24 เดือน (ทุก 2 ปี)';
    if (months === 36) return '36 เดือน (ทุก 3 ปี)';
    return `${months} เดือน`;
  }, [data?.reviewCycleMonths]);

  // Workflow Stakeholders
  const reviewer = useMemo(() => {
    return (masterUsers || []).find(u => u.id === data?.reviewerId || u.empId === data?.reviewerId);
  }, [masterUsers, data?.reviewerId]);

  const approver = useMemo(() => {
    return (masterUsers || []).find(u => u.id === data?.approverId || u.empId === data?.approverId);
  }, [masterUsers, data?.approverId]);

  // Restricted Access Users List
  const restrictedUsersList = useMemo(() => {
    if (data?.accessScope !== 'Restricted') return [];
    const userIds = data?.accessUsers || [];
    return userIds.map(uid => {
      const user = (masterUsers || []).find(u => u.id === uid || u.empId === uid);
      const isCurrent = uid === currentUser?.id || uid === currentUser?.empId;
      const isRev = uid === data?.reviewerId;
      const isAppr = uid === data?.approverId;

      let roleBadge = '';
      if (isCurrent) roleBadge = 'ผู้ลงทะเบียน';
      else if (isRev) roleBadge = 'ผู้ทบทวน';
      else if (isAppr) roleBadge = 'ผู้อนุมัติ';

      return {
        id: uid,
        name: user ? (user.fullName || user.name) : uid,
        department: user?.department || user?.dept || '-',
        roleBadge
      };
    });
  }, [data?.accessScope, data?.accessUsers, data?.reviewerId, data?.approverId, masterUsers, currentUser]);

  if (!isOpen || !data) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden z-10 my-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Top Sticky Header */}
          <div className="px-6 py-4 border-b border-slate-200/90 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 bg-gradient-to-br from-[#da7756] to-amber-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-[#da7756]/20">
                <Send size={20} className="translate-x-0.5 -translate-y-0.5" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  {isResubmit ? 'ยืนยันการส่งคำร้องอีกครั้ง (Resubmit)' : documentToEdit ? 'ยืนยันการอัปเดตเวอร์ชันเอกสารภายนอก' : 'ยืนยันการลงทะเบียนเอกสารภายนอก'}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {isResubmit 
                    ? 'ตรวจสอบข้อมูลที่แก้ไขก่อนส่งกลับเข้าสู่กระบวนการทบทวนอีกครั้ง'
                    : 'กรุณาตรวจสอบข้อมูลสรุปให้ครบถ้วนก่อนส่งเข้าสู่สายการทบทวนและอนุมัติ'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-xl transition-all cursor-pointer outline-none"
              title="ปิดหน้าต่าง"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Body with Bento Grid */}
          <div className="p-6 overflow-y-auto flex-1 bg-slate-50/60 space-y-5 custom-scrollbar">
            
            {/* Hero Header Banner */}
            <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-slate-50 border border-amber-200/80 rounded-2xl p-5 shadow-2xs relative overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 mb-2.5">
                <span className="inline-flex items-center gap-1.5 bg-[#da7756] text-white px-3 py-1 rounded-xl text-xs sm:text-sm font-mono font-bold shadow-xs">
                  <FileText size={14} />
                  <span>{data.edCode || data.docNo}</span>
                </span>

                {documentToEdit && !isResubmit ? (
                  <span className="inline-flex items-center gap-1.5 bg-white/90 border border-indigo-200 text-indigo-900 px-2.5 py-1 rounded-xl text-xs font-semibold shadow-2xs">
                    <span className="text-slate-500 font-sans font-normal">ฉบับเดิม: {documentToEdit.sourceVersion || documentToEdit.edition || 'ฉบับแรก'}</span>
                    <span className="text-slate-400 font-sans">➔</span>
                    <span className="text-indigo-700 font-bold">ฉบับใหม่: {data.sourceVersion || 'ระบุฉบับใหม่'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center bg-white/90 border border-indigo-300/80 text-indigo-900 px-2.5 py-1 rounded-xl text-xs font-semibold shadow-2xs">
                    {data.sourceVersion ? `เวอร์ชัน/ครั้งที่พิมพ์: ${data.sourceVersion}` : 'ฉบับตั้งต้น (Initial Edition)'}
                  </span>
                )}

                <span className="inline-flex items-center bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-xl text-xs font-bold uppercase tracking-wide">
                  เอกสารภายนอก (External Document)
                </span>
              </div>

              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug tracking-tight">
                {data.title || 'ไม่มีชื่อเอกสาร'}
              </h1>

              {/* Related Standards Chips */}
              {(data.relatedStandards || []).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-amber-200/50">
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-1">
                    <Tag size={13} className="text-[#da7756]" />
                    มาตรฐานที่เกี่ยวข้อง:
                  </span>
                  {data.relatedStandards.map(std => {
                    const isOther = std === 'อื่น ๆ (Others)' && data.otherStandardDetail;
                    return (
                      <span 
                        key={std}
                        className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 text-xs px-2.5 py-0.5 rounded-lg font-medium shadow-2xs"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#da7756]"></span>
                        <span>{isOther ? `${std}: ${data.otherStandardDetail}` : std}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bento Grid 2-Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              
              {/* Bento Card 1: ข้อมูลพื้นฐานและรอบเวลา (General & Cycle) */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4 flex flex-col justify-between hover:border-slate-300 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Clock size={16} />
                    </div>
                    <span>1. ข้อมูลพื้นฐานและรอบเวลา (General & Cycle)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3">
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                        แผนกผู้รับผิดชอบ
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Building2 size={15} className="text-slate-400 shrink-0" />
                        <span className="inline-flex items-center bg-slate-100 text-slate-800 font-bold text-xs px-2.5 py-1 rounded-lg border border-slate-200">
                          {data.department || 'ไม่ระบุ'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                        หน่วยงานผู้ออกเอกสาร (Source)
                      </span>
                      <p className="text-xs font-bold text-slate-800 leading-snug truncate" title={data?.issuer || data?.officialIssuer || data?.source || '-'}>
                        {data?.issuer || data?.officialIssuer || data?.source || '-'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">วันที่มีผลบังคับใช้:</span>
                    <span className="font-bold text-slate-800">{effectiveDateFormatted}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">รอบการทบทวน:</span>
                    <span className="font-semibold text-slate-700">{cycleText}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-200/70">
                    <span className="text-amber-700 font-bold flex items-center gap-1">
                      <Calendar size={13} />
                      ครบกำหนดทบทวนรอบถัดไป:
                    </span>
                    <span className="font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-md border border-amber-200 text-xs">
                      {nextReviewDateFormatted}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bento Card 2: ขอบเขตการแจกจ่ายและสิทธิ์เข้าถึง (Access & Distribution) */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4 flex flex-col justify-between hover:border-slate-300 transition-colors">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Shield size={16} />
                      </div>
                      <span>2. สิทธิ์เข้าถึง (Access Scope)</span>
                    </div>

                    {/* Scope Pill */}
                    <div>
                      {data.accessScope === 'General' && (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          General (ทั่วไป)
                        </span>
                      )}
                      {data.accessScope === 'Department' && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold px-2.5 py-1 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          Department (เฉพาะแผนก)
                        </span>
                      )}
                      {data.accessScope === 'Restricted' && (
                        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold px-2.5 py-1 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          Restricted (จำกัดสิทธิ์)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Details per scope */}
                  <div className="pt-3">
                    {data.accessScope === 'General' && (
                      <p className="text-xs text-slate-600 leading-relaxed bg-emerald-50/40 p-3 rounded-xl border border-emerald-100">
                        เอกสารนี้เปิดให้<strong>พนักงานทุกคนในทุกแผนก</strong>สามารถเข้าถึงและศึกษาได้ตามปกติ
                      </p>
                    )}

                    {data.accessScope === 'Department' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                          <span>แผนกที่ได้รับสิทธิ์:</span>
                          <span className="text-blue-700 font-bold">{(data.accessDepartments || []).length} แผนก</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-2 bg-slate-50 rounded-xl border border-slate-100">
                          {(data.accessDepartments || []).map(d => (
                            <span 
                              key={d}
                              className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-800 text-xs font-bold px-2 py-1 rounded-lg shadow-2xs"
                            >
                              <Building2 size={12} className="text-blue-500" />
                              <span>{d}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {data.accessScope === 'Restricted' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">ผู้ได้รับสิทธิ์เข้าถึงทั้งหมด:</span>
                          <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            {restrictedUsersList.length} ท่าน
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-2 bg-slate-50 rounded-xl border border-slate-100">
                          {restrictedUsersList.map(u => (
                            <span 
                              key={u.id}
                              className="inline-flex items-center gap-1.5 bg-white border border-rose-200 text-slate-800 text-xs px-2 py-1 rounded-lg shadow-2xs font-medium"
                            >
                              <span className="font-bold text-rose-800">{u.name}</span>
                              <span className="text-[10px] font-mono bg-rose-50 text-rose-600 px-1 rounded border border-rose-100">
                                {u.department}
                              </span>
                              {u.roleBadge && (
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded">
                                  {u.roleBadge}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                  <Sparkles size={13} className="text-indigo-500 shrink-0" />
                  <span>ระบบจะควบคุมสิทธิ์การดาวน์โหลดและการมองเห็นตามนโยบายความมั่นคงปลอดภัย</span>
                </div>
              </div>

              {/* Bento Card 3: สายการทบทวนและอนุมัติ (Workflow Sign-off) - Full Width across 2 columns */}
              <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4 hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CheckCircle2 size={16} />
                    </div>
                    <span>3. สายการทบทวนและอนุมัติ (Workflow Sign-off)</span>
                  </div>
                  <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                    ขั้นตอนการเห็นชอบ 3 ระดับ
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  
                  {/* Step 1: Requester */}
                  <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80 relative flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-200/70 px-2 py-0.5 rounded">
                          ขั้นตอนที่ 1 : ผู้ขอลงทะเบียน
                        </span>
                        <Check size={14} className="text-emerald-500" />
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {currentUser?.fullName || currentUser?.name || 'ผู้ใช้งานปัจจุบัน'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {currentUser?.position || 'เจ้าหน้าที่'} • <span className="font-semibold text-slate-700">{currentUser?.department || data.department}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-1 rounded-md font-medium">
                      ผู้จัดทำคำร้อง (Initiator)
                    </div>
                  </div>

                  {/* Step 2: Reviewer */}
                  <div className="bg-amber-50/40 rounded-xl p-3.5 border border-amber-200/80 relative flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider bg-amber-100 px-2 py-0.5 rounded">
                          ขั้นตอนที่ 2 : ผู้ทบทวน
                        </span>
                        <ArrowRight size={14} className="text-amber-500" />
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {reviewer ? (reviewer.fullName || reviewer.name) : data.reviewerId || 'ไม่ระบุ'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {reviewer?.position || 'ผู้ทบทวนเอกสาร'} • <span className="font-semibold text-slate-700">{reviewer?.department || '-'}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-amber-800 bg-amber-100/60 border border-amber-200/80 px-2 py-1 rounded-md font-medium">
                      ผู้ทบทวนความถูกต้อง (External Reviewer)
                    </div>
                  </div>

                  {/* Step 3: Approver */}
                  <div className="bg-indigo-50/40 rounded-xl p-3.5 border border-indigo-200/80 relative flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-100 px-2 py-0.5 rounded">
                          ขั้นตอนที่ 3 : ผู้อนุมัติ
                        </span>
                        <ArrowRight size={14} className="text-indigo-500" />
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {approver ? (approver.fullName || approver.name) : data.approverId || 'ไม่ระบุ'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {approver?.position || 'ผู้อนุมัติเอกสาร'} • <span className="font-semibold text-slate-700">{approver?.department || '-'}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-indigo-800 bg-indigo-100/60 border border-indigo-200/80 px-2 py-1 rounded-md font-medium">
                      ผู้อนุมัติประกาศใช้ (External Approver)
                    </div>
                  </div>

                </div>
              </div>

              {/* Bento Card 4: ไฟล์เอกสารและสำเนาควบคุม (Attachment & Copies) - Full Width */}
              <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4 hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-2.5">
                  <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                    <Layers size={16} />
                  </div>
                  <span>4. ไฟล์เอกสารและสำเนาควบคุม (Attachment & Copies)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Official PDF File */}
                  <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80 space-y-2">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      ไฟล์เอกสารทางการ (Official PDF File)
                    </span>
                    {data.fileName ? (
                      <div className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-amber-200 shadow-2xs">
                        <div className="w-9 h-9 rounded-lg bg-amber-50 text-[#da7756] flex items-center justify-center shrink-0">
                          <FileText size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate" title={data.fileName}>
                            {data.fileName}
                          </p>
                          <span className="text-[10px] text-emerald-600 font-medium">
                            พร้อมประทับลายน้ำและลงทะเบียนในระบบ
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 bg-white p-2.5 rounded-lg border border-dashed border-slate-300">
                        ยังไม่ได้แนบไฟล์เอกสารทางการ (ระบบจะลงทะเบียนเป็นข้อมูลระเบียนอ้างอิง)
                      </div>
                    )}
                  </div>

                  {/* Physical Controlled Copies Demand */}
                  <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80 space-y-2">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      สถานะการขอออกสำเนาควบคุมกระดาษ (Physical Copy)
                    </span>
                    {data.isPhysicalCopy ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 bg-amber-50 text-amber-900 border border-amber-200 p-2.5 rounded-lg text-xs font-bold shadow-2xs">
                          <Printer size={16} className="text-[#da7756] shrink-0" />
                          <span>ต้องการพิมพ์เล่มแจกจ่ายหน้างาน (Physical Controlled Copies)</span>
                        </div>
                        {(data.distributions || []).length > 0 && (
                          <div className="text-xs text-slate-600">
                            จำนวนสำเนาที่ต้องการแจกจ่าย: <strong>{(data.distributions || []).length} ชุด</strong>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-slate-100 text-slate-700 border border-slate-200 p-2.5 rounded-lg text-xs font-semibold shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        <span>ใช้งานระบบดิจิทัลอย่างเดียว (Digital Reference Only - ไม่พิมพ์เล่ม)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Edit Reason / Resubmit Notice */}
                {!isResubmit && documentToEdit && data.reason && (
                  <div className="mt-3 pt-3 border-t border-slate-100 bg-rose-50/40 p-3 rounded-xl border border-rose-200/60">
                    <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
                      เหตุผลในการปรับปรุงเวอร์ชัน (Update Reason):
                    </span>
                    <p className="text-xs text-slate-800 font-medium mt-1 leading-relaxed">
                      {data.reason}
                    </p>
                  </div>
                )}
                {isResubmit && (
                  <div className="mt-3 pt-3 border-t border-slate-100 bg-amber-50/50 p-3 rounded-xl border border-amber-200/60">
                    <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
                      การส่งคำร้องแก้ไข (Resubmission):
                    </span>
                    <p className="text-xs text-slate-800 font-medium mt-1 leading-relaxed">
                      คำร้องนี้ได้รับการแก้ไขตามข้อเสนอแนะ และจะส่งต่อไปยังผู้ทบทวนอีกครั้ง
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Sticky Footer Actions */}
          <div className="bg-white border-t border-slate-200/90 px-6 py-4 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-sm font-semibold px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer outline-none"
            >
              ย้อนกลับไปแก้ไข
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="bg-[#da7756] hover:bg-[#c96646] text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer outline-none active:scale-[0.99]"
            >
              <CheckCircle2 size={18} />
              <span>{isResubmit ? 'ส่งคำร้องอีกครั้ง (Resubmit)' : documentToEdit ? 'ยืนยันส่งคำขออัปเดต' : 'ยืนยันการลงทะเบียน (Confirm)'}</span>
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ExternalDocConfirmModal;
