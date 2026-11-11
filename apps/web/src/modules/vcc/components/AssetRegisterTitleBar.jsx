import React from 'react';
import { Plus, SlidersHorizontal, Lock } from 'lucide-react';

export const AssetRegisterTitleBar = ({
  title = 'ทะเบียนเครื่องมือวัด (Equipment Register)',
  description = 'จัดการทะเบียนเครื่องมือวัดและชุดเครื่องมือมาตรฐาน ตรวจสอบรหัสเครื่องมือไม่ให้ซ้ำทั้งบริษัท และบันทึกประวัติการแก้ไขทุกขั้นตอน',
  departmentBadgeText,
  departmentLocked = false,
  isDccUser = false,
  canAddAsset = false,
  onOpenTypes,
  onAdd
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight break-words">
            {title}
          </h1>
          {departmentBadgeText && (
            <span
              data-testid="locked-department-badge"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0"
              title={departmentLocked ? 'จำกัดขอบเขตการดูตามแผนกที่คุณสังกัด' : 'ขอบเขตแผนกปัจจุบัน'}
            >
              {departmentLocked && <Lock size={12} className="text-slate-400" />}
              <span>{departmentBadgeText}</span>
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-slate-500 max-w-2xl hidden md:block">
            {description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isDccUser && (
          <button
            type="button"
            onClick={onOpenTypes}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer select-none"
          >
            <SlidersHorizontal size={14} className="text-slate-500" />
            <span>ตั้งค่าประเภทเครื่องมือ</span>
          </button>
        )}
        {canAddAsset && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 min-h-[36px] rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer select-none"
          >
            <Plus size={15} />
            <span>เพิ่มเครื่องมือ</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default AssetRegisterTitleBar;
