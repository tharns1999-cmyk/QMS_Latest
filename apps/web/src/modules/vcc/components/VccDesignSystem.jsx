import React from 'react';
import { PackageOpen } from 'lucide-react';
import {
  WORK_ORDER_STATUS_LABELS,
  RESULT_STATUS_LABELS,
  ASSET_STATUS_LABELS,
  NOTIFICATION_STATUS_LABELS
} from '../utils/statusLabels';

/**
 * Standard Design Tokens for VCC (Enterprise SaaS - Minimal Luxury)
 */
export const VCC_TOKENS = {
  button: {
    primary:
      'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[38px] text-xs sm:text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-xs hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none motion-safe:active:scale-[0.98]',
    secondary:
      'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[38px] text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none motion-safe:active:scale-[0.98]',
    success:
      'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[38px] text-xs sm:text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none motion-safe:active:scale-[0.98]',
    danger:
      'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[38px] text-xs sm:text-sm font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none motion-safe:active:scale-[0.98]',
    ghost:
      'inline-flex items-center justify-center gap-2 px-3 py-1.5 min-h-[44px] sm:min-h-[36px] text-xs sm:text-sm font-semibold rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer select-none',
    dangerGhost:
      'inline-flex items-center justify-center gap-2 px-3 py-1.5 min-h-[44px] sm:min-h-[36px] text-xs sm:text-sm font-semibold rounded-xl text-rose-600 hover:text-rose-800 hover:bg-rose-50 active:bg-rose-100 transition-colors cursor-pointer select-none'
  },
  input:
    'w-full h-10 sm:h-9 px-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-colors shadow-2xs',
  select:
    'w-full h-10 sm:h-9 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-colors shadow-2xs cursor-pointer',
  card:
    'bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 sm:p-5 transition-shadow hover:shadow-xs'
};

/**
 * VccBadge - WCAG AA High-Contrast Semantic Status Badge
 */
export const VccBadge = ({
  status,
  type = 'WORK_ORDER', // 'WORK_ORDER' | 'RESULT' | 'ASSET' | 'NOTIFICATION' | 'CUSTOM'
  label = null,
  size = 'md', // 'sm' | 'md' | 'lg'
  dot = false,
  className = ''
}) => {
  const norm = String(status || '').toUpperCase();
  const displayLabel =
    label ||
    (type === 'WORK_ORDER'
      ? WORK_ORDER_STATUS_LABELS[norm]
      : type === 'RESULT'
      ? RESULT_STATUS_LABELS[norm]
      : type === 'ASSET'
      ? ASSET_STATUS_LABELS[norm]
      : type === 'NOTIFICATION'
      ? NOTIFICATION_STATUS_LABELS[norm]
      : norm) ||
    norm;

  let style = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';

  // Work Orders & Asset Status
  if (['CLOSED', 'PASS', 'ACTIVE'].includes(norm)) {
    style = 'bg-emerald-50 text-emerald-800 border-emerald-300';
    dotColor = 'bg-emerald-500';
  } else if (['FAIL', 'ON_HOLD', 'CRITICAL', 'REJECTED'].includes(norm)) {
    style = 'bg-rose-50 text-rose-800 border-rose-300';
    dotColor = 'bg-rose-500';
  } else if (['OVERDUE', 'WARNING', 'DUE_SOON', 'DUE_TODAY', 'UNDER_REPAIR'].includes(norm)) {
    style = 'bg-amber-50 text-amber-900 border-amber-300';
    dotColor = 'bg-amber-500';
  } else if (['PENDING_REVIEW', 'REQUESTED', 'SCHEDULED', 'OPEN', 'PENDING', 'INFO'].includes(norm)) {
    style = 'bg-indigo-50 text-indigo-800 border-indigo-300';
    dotColor = 'bg-indigo-500';
  } else if (['CANCELLED', 'RETIRED'].includes(norm)) {
    style = 'bg-slate-100 text-slate-600 border-slate-300';
    dotColor = 'bg-slate-400';
  } else if (norm === 'INCONCLUSIVE') {
    style = 'bg-purple-50 text-purple-900 border-purple-300';
    dotColor = 'bg-purple-500';
  }

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px]'
      : size === 'lg'
      ? 'px-3.5 py-1 text-sm'
      : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-semibold border ${sizeClasses} ${style} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />}
      <span>{displayLabel}</span>
    </span>
  );
};

/**
 * VccEmptyState - Accessible and Elegant Empty State
 */
export const VccEmptyState = ({
  icon: Icon = PackageOpen,
  title = 'ไม่พบข้อมูลที่เกี่ยวข้อง',
  subtitle = 'ยังไม่มีข้อมูลที่จะแสดงผลในเงื่อนไขการค้นหาปัจจุบัน',
  action = null,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center max-w-md mx-auto ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 border border-slate-200/80 flex items-center justify-center mb-3">
        <Icon size={24} strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-bold text-slate-800 tracking-tight">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-1 max-w-sm">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

/**
 * VccSkeleton - Accessible Shimmering Skeleton Loader
 */
export const VccSkeleton = ({ count = 3, type = 'card', className = '' }) => {
  return (
    <div className={`space-y-3 animate-pulse ${className}`} role="status" aria-label="กำลังโหลดข้อมูล">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={
            type === 'card'
              ? 'bg-slate-100 border border-slate-200/60 rounded-2xl h-24 p-4'
              : type === 'table-row'
              ? 'bg-slate-100 border-b border-slate-200/60 h-12'
              : 'bg-slate-100 rounded-xl h-10'
          }
        />
      ))}
      <span className="sr-only">กำลังโหลดข้อมูล...</span>
    </div>
  );
};

/**
 * VccScrollIndicator - Subtle Visual Cue for Horizontally Scrollable Tables
 */
export const VccScrollIndicator = ({ canScrollLeft, canScrollRight }) => {
  if (!canScrollLeft && !canScrollRight) return null;
  return (
    <>
      {canScrollLeft && (
        <div
          data-testid="vcc-scroll-cue-left"
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-slate-900/10 to-transparent transition-opacity z-20"
        />
      )}
      {canScrollRight && (
        <div
          data-testid="vcc-scroll-cue-right"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-900/10 to-transparent transition-opacity z-20"
        />
      )}
    </>
  );
};

