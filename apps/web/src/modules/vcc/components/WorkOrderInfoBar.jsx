import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, X, ShieldCheck } from 'lucide-react';

export const WorkOrderInfoBar = ({ thresholds = {}, woSettings = {} }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef(null);

  const reqReviewerLevel = thresholds.required_reviewer_level ?? 4;
  const reqApproverLevel = thresholds.required_approver_level ?? 5;
  const retentionYears = woSettings.retention_years ?? 3;

  // Click outside to dismiss popover
  useEffect(() => {
    if (!isExpanded) return undefined;
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isExpanded]);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Summary Trigger Button */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer select-none ${
          isExpanded
            ? 'bg-purple-50 border-purple-300 text-purple-900 shadow-2xs'
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
        }`}
        aria-expanded={isExpanded}
        aria-label="กติกาใบสั่งงานทวนสอบ/สอบเทียบ การตรวจรับผล และการระงับใช้ (ON_HOLD)"
      >
        <HelpCircle size={14} className={isExpanded ? 'text-purple-700' : 'text-slate-500'} />
        <span>กติกา QMS</span>
        {isExpanded ? (
          <ChevronUp size={13} className="text-purple-700" />
        ) : (
          <ChevronDown size={13} className="text-slate-400" />
        )}
      </button>

      {/* Expanded Details - Clean Popover Panel without full-width banner */}
      {isExpanded && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-[340px] sm:w-[420px] bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-xs sm:text-sm text-slate-800 space-y-3 animate-in fade-in slide-in-from-top-1"
          role="region"
          aria-label="รายละเอียดข้อกำหนด QMS"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-xs sm:text-sm">
              <ShieldCheck size={16} className="text-purple-700" />
              <span>กติกาและข้อกำหนด QMS (3 ข้อ)</span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer transition-colors"
              aria-label="ปิดรายละเอียดกติกา"
            >
              <X size={15} />
            </button>
          </div>

          <ul className="list-disc list-inside space-y-2 text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
            <li>
              ใบสั่งงานต้องผูกกับ <span className="font-bold text-slate-900">เครื่องมือรายตัว</span> เท่านั้น และต้องกรอก{' '}
              <span className="font-bold text-slate-900">เลขที่ใบรับรอง + เกณฑ์ยอมรับ</span> ก่อนส่งตรวจรับ
            </li>
            <li>
              ผู้ตรวจรับผล (<span className="font-mono font-bold text-slate-900">L{reqReviewerLevel}+</span> คนละคนกับผู้บันทึกผล)
              ต้องอนุมัติจึงจะปิดงาน (<span className="font-mono font-bold text-slate-900">CLOSED</span>) และอัปเดตแถว{' '}
              <span className="font-mono font-bold text-slate-900">Act.</span> ในตารางแผน
            </li>
            <li>
              เมื่อผลเป็น <span className="font-bold text-rose-700">FAIL</span> เครื่องมือจะถูกระงับใช้ (
              <span className="font-mono font-bold text-rose-700">ON_HOLD</span>) ทันที และต้องให้ผู้อนุมัติระดับ{' '}
              <span className="font-mono font-bold text-slate-900">L{reqApproverLevel}+</span> บันทึกการประเมินผลกระทบก่อนปลดระงับ •
              อายุเก็บประวัติใบรับรองปัจจุบัน: <span className="font-bold text-slate-900">{retentionYears} ปี</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default WorkOrderInfoBar;
