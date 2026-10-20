import React, { useState } from 'react';
import { 
  FileText, 
  CheckCircle, 
  Ban, 
  X, 
  Globe, 
  Lock, 
  Building2, 
  ShieldAlert, 
  Eye, 
  Calendar, 
  Layers, 
  FileCheck2, 
  MessageSquare,
  RotateCcw
} from 'lucide-react';
import { motion } from 'framer-motion';
import useStore from '../../../../store/useStore';
import { ACCESS_SCOPES, ACCESS_SCOPE_METADATA } from '../../utils/accessControl';
import { getDarReason, getDarDetail, getDarDocInfo, getRequesterName } from '../../utils/darHelper';
import { UniversalWatermarkService, WATERMARK_TYPES } from '../../services/UniversalWatermarkService';
import { calculateCopyAllocations, cleanLocationName } from '../../services/MasterDataService';
import { formatThaiReadableDate } from '../../../../shared/utils/dateFormatter';
import toast from 'react-hot-toast';

/**
 * Format ISO string or date string to readable Thai date
 */
const formatThaiDate = (dateInput) => {
  return formatThaiReadableDate(dateInput);
};

/**
 * DarReviewModal Component
 * 
 * Enterprise Comprehensive Inspector & Review/Approval Modal
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {Function} props.onClose - Modal close handler
 * @param {Object} props.dar - DAR object or null
 * @param {string} props.role - 'REVIEWER' | 'APPROVER' | 'VIEWER' | 'DCC'
 * @param {Function} props.onApprove - (comment) => void
 * @param {Function} props.onReject - (comment) => void
 * @param {Function} props.onReturn - (comment) => void
 * @param {boolean} props.readOnly - If true, hide review action buttons
 */
const DarReviewModal = ({
  isOpen,
  onClose,
  dar,
  role = 'VIEWER',
  onApprove,
  onReject,
  onReturn,
  readOnly = false
}) => {
  const { documents, masterUsers, currentUser } = useStore();
  const [comment, setComment] = useState('');

  if (!isOpen || !dar) return null;

  const docInfo = getDarDocInfo(dar, documents);
  const requesterName = getRequesterName(dar, masterUsers);
  const requester = masterUsers?.find(u => u.id === dar.requesterId);
  const ownerDept = dar.department || requester?.department || 'QA';

  // Access Control Null Safety
  const accessControl = dar.access_control || {
    scope: dar.access_scope || ACCESS_SCOPES.GENERAL,
    authorized_depts: dar.authorized_depts || [],
    authorized_users: dar.authorized_users || [],
    min_access_level: dar.min_access_level ?? 4
  };

  const scopeMeta = ACCESS_SCOPE_METADATA[accessControl.scope] || ACCESS_SCOPE_METADATA.GENERAL;

  // Controlled Copies & Distributions (ISO 9001: Master strictly held at DCC, all distributed copies are Controlled Copies)
  const isFormDoc = String(dar.docType || dar.doc_type || docInfo.docCode || '').startsWith('FM');
  const rawDistributions = dar.distributions || dar.distribution_locations || [];
  const allocations = calculateCopyAllocations(ownerDept, rawDistributions);
  const allControlledCopies = isFormDoc && rawDistributions.length === 0 ? [] : (allocations?.allAllocations || []);
  const totalControlledCopies = allControlledCopies.length;
  const isDigitalOnly = isFormDoc || rawDistributions.length === 0 || totalControlledCopies === 0;

  // Standards Badges
  const relatedStandards = dar.relatedStandards || dar.standards || [];

  const isObsolete = Boolean(
    dar?.type === 'OBSOLETE' || 
    dar?.darType === 'OBSOLETE' || 
    dar?.type === 'CANCEL' ||
    dar?.requestType === 'OBSOLETE'
  );

  // Handlers
  const handleApproveClick = () => {
    if (onApprove) onApprove(comment);
  };

  const handleReturnClick = () => {
    if (!comment.trim()) {
      toast.error('กรุณาระบุความคิดเห็นหรือข้อเสนอแนะในการส่งกลับแก้ไข');
      return;
    }
    if (onReturn) onReturn(comment);
  };

  const handleRejectClick = () => {
    if (!comment.trim()) {
      toast.error('กรุณาระบุเหตุผลการไม่อนุมัติคำร้อง');
      return;
    }
    if (onReject) onReject(comment);
  };

  const handleOpenPdfDraft = async () => {
    try {
      const mockDocForPreview = {
        id: dar.id,
        title: docInfo.docCode || dar.title,
        name: dar.title,
        rev: docInfo.docRev || '00',
        department: ownerDept,
        effectiveDate: dar.effectiveDate || 'DRAFT'
      };

      await UniversalWatermarkService.downloadWatermarkedPdf(
        mockDocForPreview,
        WATERMARK_TYPES.DRAFT_WATERMARK,
        {
          userName: currentUser.name,
          userDept: currentUser.department || 'QA',
          effectiveDate: dar.effectiveDate || 'DRAFT'
        },
        true // Open in new tab
      );
      toast.success('เปิดตัวอย่างเอกสารฉบับร่าง (Draft Watermark) สำเร็จ');
    } catch (err) {
      console.error(err);
      setIsPdfPreviewOpen(true);
    }
  };

  // Status mapping
  const getStatusBadge = () => {
    switch (dar.status) {
      case 'UNDER_REVIEW':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF8E6] text-[#B87C33] border border-[#FDE6B0]">🟡 รอทบทวน (Pending Review)</span>;
      case 'PENDING_APPROVAL':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F5EEFE] text-[#7C3AED] border border-[#E9D5FF]">🟣 รออนุมัติ (Pending Approval)</span>;
      case 'WAITING_EFFECTIVE':
      case 'APPROVED_WAITING_EFFECTIVE':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EBFBF0] text-[#14AE5C] border border-[#C3F4D2]">🟢 อนุมัติแล้ว (Approved)</span>;
      case 'RETURNED_FOR_REVISION':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF0F0] text-[#E02424] border border-[#FDE8E8]">🔴 ส่งกลับแก้ไข (Revision Required)</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF0F0] text-[#E02424] border border-[#FDE8E8]">❌ ไม่อนุมัติ (Rejected)</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">{dar.status || 'SUBMITTED'}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-4xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 my-auto animate-in fade-in zoom-in-95 duration-150"
      >
        {/* ========================================================================= */}
        {/* Header & Status Strip */}
        {/* ========================================================================= */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 sm:py-4 flex items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0D99FF] flex items-center justify-center border border-blue-100 dark:border-blue-900/50 shrink-0">
              <FileCheck2 size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="font-mono text-xs font-bold text-[#0D99FF] bg-[#E5F4FF] dark:bg-blue-950/50 px-2.5 py-1 rounded-md border border-[#B8E1FF] dark:border-blue-800">
                  📄 คำร้อง DAR: {dar.id} • Rev.{docInfo.docRev || '00'}
                </span>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                ยื่นคำร้องโดย: <strong className="text-slate-900 dark:text-slate-100">{requesterName}</strong> • ฝ่าย{ownerDept} | วันที่ยื่น: {formatThaiDate(dar.createdAt || dar.date || new Date())}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* Scrollable 6 Grouped Data Cards */}
        {/* ========================================================================= */}
        <div className="p-6 overflow-y-auto space-y-4 bg-[#F9F9F9]/60 custom-scrollbar flex-1">
          
          {/* ┌─ [1] ข้อมูลเอกสารและมาตรฐาน ──────────────────────────────────────────────┐ */}
          <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#444444] flex items-center gap-1.5">
                <FileText size={15} className="text-[#0D99FF]" /> 1. ข้อมูลเอกสารและมาตรฐาน (Document & Standards Information)
              </h4>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-[#007BE5] border border-blue-100">
                {dar.type === 'NEW' ? '✨ ฉบับใหม่ (New Document)' : dar.type === 'REVISION' ? '🔄 ขอแก้ไข (Revision)' : '⚠️ ขอยกเลิก (Obsolete)'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#777777] block text-[11px]">รหัสเอกสาร (Document Code)</span>
                <span className="font-mono font-bold text-sm text-[#007BE5] mt-0.5 block">
                  {docInfo.docCode} {dar.type === 'NEW' ? '(ฉบับใหม่)' : `(Rev.${docInfo.docRev})`}
                </span>
              </div>
              <div>
                <span className="text-[#777777] block text-[11px]">ประเภทเอกสาร (Document Type)</span>
                <span className="font-semibold text-[#1E1E1E] mt-0.5 block">
                  {docInfo.docType} ({dar.docType || 'ระเบียบปฏิบัติงาน'})
                </span>
              </div>
              <div className="md:col-span-2">
                <span className="text-[#777777] block text-[11px]">ชื่อเอกสาร (Document Title)</span>
                <span className="font-bold text-sm text-[#1E1E1E] mt-0.5 block">
                  {dar.title}
                </span>
              </div>
              <div className="md:col-span-2">
                <span className="text-[#777777] block text-[11px] mb-1">ระบบมาตรฐานที่เกี่ยวข้อง (Related Standards)</span>
                <div className="flex flex-wrap gap-1.5">
                  {relatedStandards.length > 0 ? (
                    relatedStandards.map(std => (
                      <span key={std} className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-[#F5F5F5] text-[#333333] border border-[#E5E5E5] text-xs font-semibold">
                        🏷️ {std}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200 text-xs">
                      มาตรฐานทั่วไป (General QMS)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ┌─ [2] วัตถุประสงค์และเหตุผล ──────────────────────────────────────────────┐ */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-2xs">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MessageSquare size={15} className="text-amber-500 shrink-0" /> 2. วัตถุประสงค์และเหตุผล (Purpose & Justification)
              </h4>
            </div>

            <div className="space-y-3 min-w-0 w-full">
              <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-4 sm:gap-4 sm:items-start py-1 min-w-0 w-full">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 sm:pt-1 shrink-0">
                  {getDarReason(dar).title}:
                </span>
                <div className="sm:col-span-3 min-w-0 w-full overflow-hidden">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-sm text-slate-800 dark:text-slate-200 leading-relaxed break-words [overflow-wrap:anywhere] break-all whitespace-pre-wrap">
                    {getDarReason(dar).value || dar.reason || 'ไม่มีข้อมูลเหตุผล'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-4 sm:gap-4 sm:items-start py-1 border-t border-slate-100 dark:border-slate-800 min-w-0 w-full">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 sm:pt-1 shrink-0">
                  {getDarDetail(dar).title}:
                </span>
                <div className="sm:col-span-3 min-w-0 w-full overflow-hidden">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-sm text-slate-800 dark:text-slate-200 leading-relaxed break-words [overflow-wrap:anywhere] break-all whitespace-pre-wrap">
                    {getDarDetail(dar).value !== '-' ? getDarDetail(dar).value : (dar.changeSummary || dar.change_summary || dar.obsoleteDetail || dar.detail || 'ไม่มีข้อมูลรายละเอียดเพิ่มเติม')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ┌─ [3] ความลับและสิทธิ์การเข้าถึง + [4] การจัดสรรสำเนาและจุดใช้งาน ──────┐ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* ┌─ [3] ความลับและสิทธิ์การเข้าถึง ─────────────────────────┐ */}
            <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 space-y-3 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="border-b border-slate-100 pb-2 mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#444444] flex items-center gap-1.5">
                    <ShieldAlert size={15} className="text-rose-500" /> 3. ความลับและสิทธิ์การเข้าถึง (Confidentiality & Access)
                  </h4>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="text-[#777777] block text-[11px] mb-1">ระดับชั้นความลับ (Access Scope)</span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${scopeMeta.badgeClass}`}>
                      {accessControl.scope === 'GENERAL' && <><Globe size={13} strokeWidth={1.5} /><span>เปิดเผยทั่วไป — ทุกคนเข้าถึงได้</span></>}
                      {accessControl.scope === 'DEPT_ONLY' && <><Lock size={13} strokeWidth={1.5} /><span>เฉพาะแผนก — ล็อกเฉพาะคนในแผนก {ownerDept}</span></>}
                      {accessControl.scope === 'TARGETED' && <><Building2 size={13} strokeWidth={1.5} /><span>เฉพาะบางแผนก — อนุญาตเฉพาะกลุ่ม</span></>}
                      {accessControl.scope === 'RESTRICTED' && <><ShieldAlert size={13} strokeWidth={1.5} /><span>ลับเฉพาะบุคคล/ตำแหน่ง</span></>}
                    </span>
                  </div>

                  {accessControl.scope === 'TARGETED' && (
                    <div>
                      <span className="text-[#777777] block text-[11px] mb-1">แผนกที่ได้รับอนุญาตเพิ่มเติม:</span>
                      <div className="flex flex-wrap gap-1">
                        {(accessControl.authorized_depts || []).map(dept => (
                          <span key={dept} className="px-2 py-0.5 bg-blue-50 text-[#007BE5] border border-blue-100 rounded text-[11px] font-bold font-mono">
                            {dept}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {accessControl.scope === 'RESTRICTED' && (
                    <div className="space-y-2 bg-rose-50/40 p-2.5 rounded-lg border border-rose-100">
                      <div>
                        <span className="text-slate-500 text-[11px]">ระดับตำแหน่งขั้นต่ำ: </span>
                        <strong className="text-rose-700 font-mono">Level {accessControl.min_access_level || 4}+ ขึ้นไป</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block mb-1">บุคคลที่ระบุเฉพาะ ({accessControl.authorized_users?.length || 0} คน):</span>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {(accessControl.authorized_users || []).map(uId => {
                            const u = masterUsers?.find(user => user.id === uId);
                            return (
                              <span key={uId} className="px-2 py-0.5 bg-white border border-rose-200 rounded text-[10px] font-bold text-slate-800">
                                {u ? `${u.name} (${u.department || u.dept})` : uId}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ┌─ [4] การจัดสรรสำเนาและจุดใช้งาน ────────────────────────┐ */}
            <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 space-y-3 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="border-b border-slate-100 pb-2 mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#444444] flex items-center gap-1.5">
                    <Layers size={15} className="text-purple-600" /> 4. การจัดสรรสำเนาและจุดใช้งาน (Distribution Matrix)
                  </h4>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-[#666666]">ยอดจัดสรรสำเนา:</span>
                    <span className="font-bold font-mono text-[#1E1E1E]">
                      {isDigitalOnly 
                        ? '📱 รูปแบบดิจิทัล (Digital Distribution)' 
                        : `ต้นฉบับ (Master): จัดเก็บที่ DCC | เล่มควบคุมแจกจ่าย: ${totalControlledCopies} ชุด`}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#777777] block text-[11px] mb-1">รายการสำเนาและจุดประจำหน้างาน:</span>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {!isDigitalOnly && allControlledCopies.length > 0 ? (
                        allControlledCopies.map((d, i) => {
                          const isOrigin = d.copyNo === '01' || d.isOwner || i === 0;
                          const rawLoc = d.location || d.station_name || d.stationName || d.locationName || d.name || d.departmentId || 'จุดหน้างาน';
                          const cleanLoc = cleanLocationName(rawLoc);
                          return (
                            <div 
                              key={i} 
                              className={`flex items-center justify-between p-1.5 rounded border text-[11px] ${
                                isOrigin 
                                  ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950' 
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                              }`}
                            >
                              <span className="font-bold font-mono text-indigo-900">
                                {isOrigin ? 'Master 01 (ต้นฉบับ)' : `Copy ${d.copyNo || String(i + 1).padStart(2, '0')} (เล่มควบคุม)`}
                              </span>
                              <span className="text-slate-600 truncate max-w-[220px]">
                                {isOrigin ? `${ownerDept} Head Office (ล็อกถาวร)` : `${cleanLoc}`}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-2 text-center text-slate-400 text-[11px] italic bg-slate-50 rounded">
                          📱 ดิจิทัล 100% (ไม่มีการพิมพ์เล่มควบคุมกระดาษ)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ┌─ [5] เอกสารแนบและวันบังคับใช้ ────────────────────────────────────────────┐ */}
          <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#444444] flex items-center gap-1.5">
                <Calendar size={15} className="text-emerald-600" /> 5. เอกสารแนบและวันบังคับใช้ (Attachments & Effective Date)
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#777777]">การรับทราบ:</span>
                <span className="font-bold text-xs text-[#0D99FF] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  {dar.ackRequirement === 'REQUIRED' || dar.ackRequired ? '🔔 ต้องรับทราบ (Acknowledge Required)' : 'ไม่ต้องรับทราบ (No Ack Required)'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs items-center">
              <div>
                <span className="text-[#777777] block text-[11px]">วันที่ขอให้มีผลบังคับใช้ (Target Effective Date)</span>
                <span className="font-mono font-bold text-sm text-emerald-700 mt-0.5 block">
                  🗓️ {formatThaiDate(dar.effectiveDate) || 'รอประกาศ'}
                </span>
              </div>

              {/* Attachment Preview Box */}
              <div className="md:col-span-2 flex items-center justify-between p-3 rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] hover:border-[#0D99FF] transition-all">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-[#1E1E1E] truncate block text-xs">
                      {docInfo.docCode ? `${docInfo.docCode}_Draft.pdf` : `${dar.title}_Draft.pdf`}
                    </span>
                    <span className="text-[10px] text-[#777777]">
                      PDF Document • พร้อมระบบลายน้ำควบคุม (Draft Watermark)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenPdfDraft}
                  className="bg-white border border-[#E5E5E5] hover:border-[#0D99FF] hover:text-[#007BE5] text-[#1E1E1E] text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
                >
                  <Eye size={14} /> เปิดดูตัวอย่าง PDF
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* Action Toolbar & Comments (Footer - Blueprint B) */}
        {/* ========================================================================= */}
        <div className="bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4 space-y-3 shrink-0">
          {!readOnly && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MessageSquare size={14} className="text-[#0D99FF]" /> ความเห็นประกอบการพิจารณา (Approval / Rejection Comments)
              </label>
              <textarea
                rows="2"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="ระบุความเห็นหรือข้อเสนอแนะในการแก้ไข (ถ้ามี)..."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#0D99FF] focus:ring-1 focus:ring-[#0D99FF] outline-hidden resize-none"
              />
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer border border-slate-200/60 sm:border-transparent"
            >
              ปิดหน้าต่าง (Close)
            </button>

            {!readOnly && (
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
                {onReject && (
                  <button
                    type="button"
                    onClick={handleRejectClick}
                    className="w-full sm:w-auto bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Ban size={14} /> <span>ไม่อนุมัติ (Reject)</span>
                  </button>
                )}

                {onReturn && (
                  <button
                    type="button"
                    onClick={handleReturnClick}
                    className="w-full sm:w-auto bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <RotateCcw size={14} /> <span>ส่งกลับแก้ไข (Request Changes)</span>
                  </button>
                )}

                {onApprove && (
                  <button
                    type="button"
                    onClick={handleApproveClick}
                    className={`w-full sm:w-auto ${
                      isObsolete
                        ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-rose-600/20'
                        : 'bg-[#14AE5C] hover:bg-[#0F8A49]'
                    } text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer`}
                  >
                    <CheckCircle size={15} /> <span>{role === 'REVIEWER' ? 'ผ่านการทบทวน (Approve Review)' : isObsolete ? 'อนุมัติยกเลิกเอกสาร (Approve Obsolete)' : 'อนุมัติคำร้อง (Approve)'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

      </motion.div>
    </div>
  );
};

export default DarReviewModal;
