import React from 'react';
import { User, ShieldCheck, Clock, CheckCircle2, AlertTriangle, XCircle, RotateCw } from 'lucide-react';
import { formatQmsDisplayDate } from '../../../../shared/utils/dateFormatter';

/**
 * Rich Review Audit Card Component
 * Conforms to strict MECE audit specifications & 1-level approval sign-off.
 */
export const PeriodicReviewAuditCard = ({ item, index = 0 }) => {
  if (!item) return null;

  const result = String(item.result || item.outcome || '').toUpperCase();
  const isNoChange = result === 'NO_CHANGE' || result === 'CONFIRM_CONTINUE';
  const isRevise = result === 'REVISE' || result === 'REVISION_REQUIRED';
  const isObsolete = result === 'OBSOLETE' || result === 'OBSOLETE_REQUIRED';

  const approvalStatus = item.approval_status || (item.approver_name || item.approver ? 'APPROVED' : 'PENDING_APPROVAL');
  const isApproved = approvalStatus === 'APPROVED';

  const reviewerName = item.reviewer_name || item.reviewer || item.reviewerName || '-';
  const reviewedAt = item.reviewed_at || item.reviewed_date || item.reviewDate || item.date || item.reviewedAt;

  const approverName = item.approver_name || item.approver || item.approverName || null;
  const approvedAt = item.approved_at || item.approvedAt || (isApproved ? reviewedAt : null);

  const reason = item.reason || item.remarks || item.comment || '-';
  const findings = item.findings || '-';
  const standardClause = item.standard_clause || item.check_source || item.standards || '-';
  const evidenceRef = item.evidence_reference || item.references || '-';
  const additionalComment = item.additional_comment || item.additionalComments || '-';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3.5 text-xs transition-all hover:border-slate-300">
      {/* Top Row: Round + Outcome Badge + Approval Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 text-sm">
            รอบที่ {item.round || item.review_round || index + 1}
          </span>
          {/* Outcome Badge */}
          {isNoChange && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 size={13} /> ยืนยันใช้งานต่อ
            </span>
          )}
          {isRevise && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <AlertTriangle size={13} /> ต้องแก้ไขเอกสาร
            </span>
          )}
          {isObsolete && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              <XCircle size={13} /> ต้องยกเลิกเอกสาร
            </span>
          )}
          {!isNoChange && !isRevise && !isObsolete && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {item.result || item.outcome || 'เสร็จสิ้น'}
            </span>
          )}
        </div>

        {/* Approval Badge */}
        <div>
          {isApproved ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck size={13} className="text-emerald-600" /> อนุมัติแล้ว
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <Clock size={13} className="text-amber-600" /> รออนุมัติจาก HOD
            </span>
          )}
        </div>
      </div>

      {/* Main Content: Reason Box */}
      {reason && reason !== '-' && (
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
          <span className="text-slate-400 font-medium block mb-1 text-[11px]">
            เหตุผลการประเมิน
          </span>
          <p className="text-slate-700 leading-relaxed break-words whitespace-pre-wrap">
            {reason}
          </p>
        </div>
      )}

      {/* 2-Column Grid for Findings, Standards, Evidence, Additional Comments */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50/60 rounded-lg border border-slate-100 text-xs">
        <div>
          <span className="text-slate-400 font-medium block mb-0.5 text-[11px]">
            ประเด็นที่พบหน้างาน
          </span>
          <span className="text-slate-700 font-medium break-words">
            {findings}
          </span>
        </div>
        <div>
          <span className="text-slate-400 font-medium block mb-0.5 text-[11px]">
            มาตรฐาน/ข้อกำหนดที่ใช้พิจารณา
          </span>
          <span className="text-slate-700 font-medium break-words">
            {standardClause}
          </span>
        </div>
        <div>
          <span className="text-slate-400 font-medium block mb-0.5 text-[11px]">
            ข้อมูลหรือหลักฐานอ้างอิง
          </span>
          <span className="text-slate-700 font-medium break-words">
            {evidenceRef}
          </span>
        </div>
        <div>
          <span className="text-slate-400 font-medium block mb-0.5 text-[11px]">
            ความคิดเห็นเพิ่มเติม
          </span>
          <span className="text-slate-700 font-medium break-words">
            {additionalComment}
          </span>
        </div>
      </div>

      {/* Sign-off Footer */}
      <div className="pt-2.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Reviewer (Left) */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
            <User size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-slate-700 font-semibold truncate">
              {reviewerName}
            </p>
            <p className="text-slate-400 text-[11px] font-mono">
              ยื่นเรื่อง: {formatQmsDisplayDate(reviewedAt)}
            </p>
          </div>
        </div>

        {/* Approver (Right) */}
        <div className="flex items-center gap-2 sm:justify-end">
          <div className={`p-1.5 rounded-lg shrink-0 ${isApproved ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <ShieldCheck size={15} />
          </div>
          <div className="min-w-0 sm:text-right">
            {approverName ? (
              <>
                <p className="text-slate-700 font-semibold truncate">
                  {approverName}
                </p>
                <p className="text-slate-400 text-[11px] font-mono">
                  อนุมัติ: {formatQmsDisplayDate(approvedAt)}
                </p>
              </>
            ) : (
              <>
                <p className="text-amber-700 font-semibold">
                  รออนุมัติจาก HOD
                </p>
                <p className="text-slate-400 text-[11px]">
                  หัวหน้าแผนก/ผู้จัดการ
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * PeriodicReviewHistoryTab Component
 * Renders the full list of periodic review audit cards for a given document.
 */
export const PeriodicReviewHistoryTab = ({ reviews = [], nextReviewDate, matchingSchedule, reversed = false }) => {
  if (!reviews || reviews.length === 0) {
    return (
      <div className="p-10 bg-white border border-dashed border-[#E2E8F0] rounded-2xl text-center flex flex-col items-center gap-3">
        <RotateCw size={32} className="text-slate-300" />
        <p className="font-bold text-sm text-slate-600">ยังไม่มีประวัติการทบทวนตามรอบ</p>
        <p className="text-xs text-slate-400 max-w-xs">
          {matchingSchedule || nextReviewDate
            ? `กำหนดทบทวนครั้งแรก: ${formatQmsDisplayDate(nextReviewDate)}`
            : 'เอกสารนี้ยังไม่ถูกบรรจุในแผนการทบทวนตามรอบ (Periodic Review Schedule)'}
        </p>
      </div>
    );
  }

  const list = reversed ? [...reviews].reverse() : reviews;

  return (
    <div className="space-y-3">
      {list.map((item, idx) => (
        <PeriodicReviewAuditCard 
          key={item.id || idx} 
          item={item} 
          index={reversed ? reviews.length - 1 - idx : idx} 
        />
      ))}
    </div>
  );
};

export default PeriodicReviewHistoryTab;
