import React from 'react';

/**
 * VccMetricsStrip
 * Executive KPI summary strip with clear priority hierarchy and status-aware accents.
 */
export default function VccMetricsStrip({ eq = {}, wo = {}, reviewSlaDays = 3 }) {
  const onHoldCount = eq.on_hold_assets ?? 0;
  const overdueCount = wo.overdue_count ?? 0;
  const pendingCount = wo.pending_review_count ?? 0;
  const completedCount = wo.completed_count ?? 0;
  const onTimeRate = wo.on_time_rate ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* 1. เครื่องมือปกติพร้อมใช้ */}
        <div className="p-4 sm:p-5 flex flex-col justify-between hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              เครื่องมือปกติ
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-900" data-testid="kpi-active-assets">
            {eq.active_assets ?? 0}{' '}
            <span className="text-xs font-normal text-slate-400 font-sans">
              / {eq.total_assets ?? 0}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 font-medium truncate">
            กลุ่มแม่ {eq.group_count ?? 0} · ปลดระวาง {eq.retired_assets ?? 0}
          </div>
        </div>

        {/* 2. ระงับใช้ (ON_HOLD) — Critical Attention */}
        <div
          className={`p-4 sm:p-5 flex flex-col justify-between transition-colors ${
            onHoldCount > 0 ? 'bg-rose-50/40' : 'hover:bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${
                onHoldCount > 0 ? 'text-rose-700' : 'text-slate-500'
              }`}
            >
              ระงับใช้ (ON_HOLD)
            </span>
            {onHoldCount > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
            )}
          </div>
          <div
            className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              onHoldCount > 0 ? 'font-bold text-rose-600' : 'font-medium text-slate-300'
            }`}
            data-testid="kpi-on-hold-assets"
          >
            {onHoldCount}
          </div>
          <div
            className={`mt-2 text-xs font-medium truncate ${
              onHoldCount > 0 ? 'text-rose-600' : 'text-slate-400'
            }`}
          >
            {onHoldCount > 0 ? `พบผลไม่ผ่าน (FAIL): ${wo.fail_count ?? 0} งาน` : 'ไม่มีเครื่องมือถูกระงับใช้'}
          </div>
        </div>

        {/* 3. เลยกำหนด (OVERDUE) — Operational Urgency */}
        <div
          className={`p-4 sm:p-5 flex flex-col justify-between transition-colors ${
            overdueCount > 0 ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${
                overdueCount > 0 ? 'text-amber-800' : 'text-slate-500'
              }`}
            >
              เลยกำหนด (OVERDUE)
            </span>
            {overdueCount > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            )}
          </div>
          <div
            className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              overdueCount > 0 ? 'font-bold text-amber-700' : 'font-medium text-slate-300'
            }`}
            data-testid="kpi-overdue-count"
          >
            {overdueCount}
          </div>
          <div
            className={`mt-2 text-xs font-medium truncate ${
              overdueCount > 0 ? 'text-amber-700' : 'text-slate-400'
            }`}
          >
            {overdueCount > 0 ? `ใกล้ครบ 7 วัน: ${wo.due_in_7_days ?? 0} งาน` : 'ไม่มีงานค้างเลยกำหนด'}
          </div>
        </div>

        {/* 4. ครบกำหนดใน 30 วัน */}
        <div className="p-4 sm:p-5 flex flex-col justify-between hover:bg-slate-50/50 transition-colors">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            ครบใน 30 วัน
          </span>
          <div
            className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              (wo.due_in_30_days ?? 0) > 0 ? 'font-bold text-slate-800' : 'font-medium text-slate-300'
            }`}
            data-testid="kpi-due-30-count"
          >
            {wo.due_in_30_days ?? 0}
          </div>
          <div className="mt-2 text-xs text-slate-400 font-medium truncate">
            จากทั้งหมด {wo.total_work_orders ?? 0} ใบงาน
          </div>
        </div>

        {/* 5. รอตรวจรับ (Pending Review) */}
        <div className="p-4 sm:p-5 flex flex-col justify-between hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              รอตรวจรับ
            </span>
            {pendingCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
          </div>
          <div
            className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              pendingCount > 0 ? 'font-bold text-indigo-700' : 'font-medium text-slate-300'
            }`}
            data-testid="kpi-pending-review-count"
          >
            {pendingCount}
          </div>
          <div className="mt-2 text-xs text-slate-400 font-medium truncate">
            SLA ตรวจรับ: {reviewSlaDays} วัน
          </div>
        </div>

        {/* 6. ปิดงานแล้ว / ทันกำหนด (Success Metric) */}
        <div className="p-4 sm:p-5 flex flex-col justify-between hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              ปิดงานแล้ว / On-Time
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </div>
          <div
            className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              completedCount > 0 ? 'font-bold text-emerald-700' : 'font-medium text-slate-300'
            }`}
            data-testid="kpi-completed-count"
          >
            {completedCount}{' '}
            <span className="text-xs font-semibold font-sans text-emerald-600">
              ({onTimeRate}%)
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 font-medium truncate">
            ทันกำหนด: {wo.on_time_count ?? 0} · ผ่าน: {wo.pass_count ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}
