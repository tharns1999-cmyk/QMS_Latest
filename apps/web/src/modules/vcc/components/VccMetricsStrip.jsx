import React from 'react';

/**
 * VccMetricsStrip
 * Executive KPI summary strip with clear priority hierarchy and status-aware accents.
 */
export default function VccMetricsStrip({ eq = {}, wo = {}, certKpi = {}, reviewSlaDays = 3 }) {
  const onHoldCount = eq.on_hold_assets ?? 0;
  const overdueCount = wo.overdue_count ?? 0;
  const pendingCount = wo.pending_review_count ?? 0;
  const completedCount = wo.completed_count ?? 0;
  const onTimeRate = wo.on_time_rate ?? 0;
  const rescheduledOverdueCount = wo.rescheduled_overdue_count ?? 0;

  const due0To7 = wo.due_0_7_days ?? 0;
  const due8To15 = wo.due_8_15_days ?? 0;
  const due16To30 = wo.due_16_30_days ?? 0;
  const totalDueSoon = wo.total_due_soon_30_days ?? (wo.due_in_30_days ?? 0);

  const certExpired = certKpi.cert_expired_count ?? 0;
  const certExpiringSoon = certKpi.total_expiring_soon ?? (certKpi.cert_expiring_0_30_days ?? 0);
  const certValid = certKpi.cert_valid_count ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* 1. เครื่องมือปกติพร้อมใช้ */}
        <div className="p-4 sm:p-5 flex flex-col justify-between hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
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
          <div className="mt-2 text-xs text-slate-400 font-medium leading-snug">
            ชุดเครื่องมือ {eq.composite_set_count ?? 0} · ปลดออกแล้ว {eq.retired_assets ?? 0}
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
              className={`text-xs font-semibold uppercase tracking-wider ${
                onHoldCount > 0 ? 'text-rose-700' : 'text-slate-500'
              }`}
            >
              ระงับใช้
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
            className={`mt-2 text-xs font-medium leading-snug ${
              onHoldCount > 0 ? 'text-rose-600' : 'text-slate-400'
            }`}
          >
            {onHoldCount > 0 ? `พบผลไม่ผ่าน: ${wo.fail_count ?? 0} งาน` : 'ไม่มีเครื่องมือถูกระงับใช้'}
          </div>
        </div>

        {/* 3. เลยกำหนด (OVERDUE) — Strict Invariance from Required Due Date */}
        <div
          className={`p-4 sm:p-5 flex flex-col justify-between transition-colors ${
            overdueCount > 0 ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold uppercase tracking-wider ${
                overdueCount > 0 ? 'text-amber-800' : 'text-slate-500'
              }`}
            >
              เลยกำหนด
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
            className={`mt-2 text-xs font-medium leading-snug ${
              overdueCount > 0 ? 'text-amber-700' : 'text-slate-400'
            }`}
          >
            {rescheduledOverdueCount > 0
              ? `เลื่อนนัดแต่เลยเกณฑ์เดิม: ${rescheduledOverdueCount} งาน`
              : overdueCount > 0
              ? 'นับจากวันครบกำหนดเดิม'
              : 'ไม่มีงานค้างเลยกำหนด'}
          </div>
        </div>

        {/* 4. ครบกำหนดใน 30 วัน — Non-overlapping Bucket Breakdown */}
        <div className="p-4 sm:p-5 flex flex-col justify-between hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              ครบใน 30 วัน
            </span>
            {totalDueSoon > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
          </div>
          <div
            className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              totalDueSoon > 0 ? 'font-bold text-slate-800' : 'font-medium text-slate-300'
            }`}
            data-testid="kpi-due-30-count"
          >
            {totalDueSoon}
          </div>
          <div className="mt-2 text-xs text-slate-400 font-medium leading-snug">
            0-7 วัน: {due0To7} · 8-15 วัน: {due8To15} · 16-30 วัน: {due16To30}
          </div>
        </div>

        {/* 5. สถานะใบรับรอง (Certificate Expiry Monitoring) */}
        <div
          className={`p-4 sm:p-5 flex flex-col justify-between transition-colors ${
            certExpired > 0 ? 'bg-rose-50/30' : certExpiringSoon > 0 ? 'bg-amber-50/30' : 'hover:bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold uppercase tracking-wider ${
                certExpired > 0 ? 'text-rose-700' : certExpiringSoon > 0 ? 'text-amber-700' : 'text-slate-500'
              }`}
            >
              อายุใบรับรอง
            </span>
            {certExpired > 0 ? (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            ) : certExpiringSoon > 0 ? (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </div>
          <div
            className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              certExpired > 0
                ? 'font-bold text-rose-600'
                : certExpiringSoon > 0
                ? 'font-bold text-amber-600'
                : 'font-bold text-slate-800'
            }`}
            data-testid="kpi-cert-status"
          >
            {certExpired > 0 ? (
              <span>
                {certExpired}{' '}
                <span className="text-xs font-normal text-rose-500 font-sans">หมดอายุ</span>
              </span>
            ) : certExpiringSoon > 0 ? (
              <span>
                {certExpiringSoon}{' '}
                <span className="text-xs font-normal text-amber-600 font-sans">ใกล้หมด</span>
              </span>
            ) : (
              <span>
                {certValid}{' '}
                <span className="text-xs font-normal text-emerald-600 font-sans">ใช้งานได้</span>
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-400 font-medium leading-snug">
            {certExpired > 0
              ? `หมดอายุแล้ว ${certExpired} ใบรับรอง`
              : certExpiringSoon > 0
              ? `ใกล้หมดใน 60 วัน: ${certExpiringSoon}`
              : `ใบรับรองสมบูรณ์`}
          </div>
        </div>

        {/* 6. รอตรวจรับ (Pending Review) */}
        <div className="p-4 sm:p-5 flex flex-col justify-between hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
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
          <div className="mt-2 text-xs text-slate-400 font-medium leading-snug">
            เกณฑ์ตรวจรับ: {reviewSlaDays} วัน
          </div>
        </div>

        {/* 7. ปิดงานแล้ว / ทันกำหนด (Success Metric) */}
        <div className="p-4 sm:p-5 flex flex-col justify-between hover:bg-slate-50/50 transition-colors col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              ปิดงานแล้ว / ทันกำหนด
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
          <div className="mt-2 text-xs text-slate-400 font-medium leading-snug">
            ทันกำหนด: {wo.on_time_count ?? 0} · ผ่าน: {wo.pass_count ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}
