import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

export const WorkOrderInfoBar = ({ thresholds = {}, woSettings = {} }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const reqReviewerLevel = thresholds.required_reviewer_level ?? 4;
  const reqApproverLevel = thresholds.required_approver_level ?? 5;
  const retentionYears = woSettings.retention_years ?? 3;

  return (
    <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl transition-all duration-200 overflow-hidden shadow-2xs">
      {/* Header Bar / Summary Trigger */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-100/50 select-none transition-colors border-0 bg-transparent"
        aria-expanded={isExpanded}
        aria-label="กติกาใบสั่งงานทวนสอบ/สอบเทียบ การตรวจรับผล และการระงับใช้ (ON_HOLD)"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-amber-100 border border-amber-200/90 flex items-center justify-center shrink-0">
            <AlertTriangle size={13} className="text-amber-700" />
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-bold text-amber-950 text-xs sm:text-sm tracking-tight truncate">
              กติกาใบสั่งงานทวนสอบ/สอบเทียบ การตรวจรับผล และการระงับใช้ (ON_HOLD)
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-200/70 text-amber-900 shrink-0">
              ข้อกำหนด QMS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-semibold text-amber-800 hidden md:inline">
            {isExpanded ? 'ย่อข้อมูลกติกา' : 'ดูรายละเอียดข้อกำหนด (3 ข้อ)'}
          </span>
          <div className="w-5 h-5 rounded-md bg-amber-100/80 flex items-center justify-center text-amber-800">
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        </div>
      </button>

      {/* Expanded Details - Preserving 100% of original text, bold spans, and badges */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 border-t border-amber-200/70 text-xs sm:text-sm text-amber-950 space-y-1.5 bg-amber-50/40">
          <ul className="list-disc list-inside space-y-1 text-xs sm:text-sm text-amber-900 leading-relaxed font-medium">
            <li>
              ใบสั่งงานต้องผูกกับ <span className="font-bold">เครื่องมือรายตัว</span> เท่านั้น และต้องกรอก{' '}
              <span className="font-bold">เลขที่ใบรับรอง + เกณฑ์ยอมรับ</span> ก่อนส่งตรวจรับ
            </li>
            <li>
              ผู้ตรวจรับผล (<span className="font-mono font-bold">L{reqReviewerLevel}+</span> คนละคนกับผู้บันทึกผล)
              ต้องอนุมัติจึงจะปิดงาน (<span className="font-mono font-bold">CLOSED</span>) และอัปเดตแถว{' '}
              <span className="font-mono font-bold">Act.</span> ในตารางแผน
            </li>
            <li>
              เมื่อผลเป็น <span className="font-bold text-rose-700">FAIL</span> เครื่องมือจะถูกระงับใช้ (
              <span className="font-mono font-bold text-rose-700">ON_HOLD</span>) ทันที และต้องให้ผู้อนุมัติระดับ{' '}
              <span className="font-mono font-bold">L{reqApproverLevel}+</span> บันทึกการประเมินผลกระทบก่อนปลดระงับ •
              อายุเก็บประวัติใบรับรองปัจจุบัน: <span className="font-bold">{retentionYears} ปี</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default WorkOrderInfoBar;
