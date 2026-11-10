import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  History,
  ChevronDown,
  ChevronUp,
  Maximize2,
  X,
  AlertTriangle,
  Clock,
  Layers,
  Search,
  CheckCircle2,
  FileEdit,
  ArrowRight
} from 'lucide-react';
import { formatVccDateTime } from '../utils/vccDateUtils';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';

/**
 * Standard Action Metadata Mapping for VCC Annual Plan Audit Trail
 */
export const PLAN_ACTION_META = {
  VCC_PLAN_CREATED: {
    label: 'จัดทำร่างแผนประจำปี',
    category: 'DATA',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-300',
    dotClass: 'bg-sky-500'
  },
  VCC_PLAN_UPDATED: {
    label: 'แก้ไขข้อมูลหัวแผน',
    category: 'DATA',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-300',
    dotClass: 'bg-blue-500'
  },
  VCC_PLAN_SUBMITTED: {
    label: 'ส่งแผนเข้าสู่การทบทวน',
    category: 'WORKFLOW',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-300',
    dotClass: 'bg-blue-600'
  },
  VCC_PLAN_REVIEWED: {
    label: 'ยืนยันการทบทวน (ส่งต่ออนุมัติ)',
    category: 'WORKFLOW',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-300',
    dotClass: 'bg-indigo-600'
  },
  VCC_PLAN_APPROVED: {
    label: 'อนุมัติแผนประจำปี',
    category: 'WORKFLOW',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    dotClass: 'bg-emerald-600'
  },
  VCC_PLAN_RETURNED: {
    label: 'ส่งแผนกลับไปแก้ไข',
    category: 'WORKFLOW',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
    dotClass: 'bg-amber-500',
    isReturn: true
  },
  VCC_PLAN_REJECTED: {
    label: 'ส่งแผนกลับไปแก้ไข',
    category: 'WORKFLOW',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
    dotClass: 'bg-amber-500',
    isReturn: true
  },
  VCC_PLAN_ITEM_SAVED: {
    label: 'ปรับปรุงรายการเครื่องมือ',
    category: 'DATA',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    dotClass: 'bg-slate-400'
  },
  VCC_PLAN_ITEM_REMOVED: {
    label: 'ลบเครื่องมือออกจากแผน',
    category: 'DATA',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
    dotClass: 'bg-rose-500'
  },
  VCC_PLAN_GROUP_CONVERTED: {
    label: 'ปรับเปลี่ยนกลุ่มเครื่องมือ',
    category: 'DATA',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-300',
    dotClass: 'bg-purple-500'
  },
  VCC_PLAN_REVISION_CREATED: {
    label: 'จัดทำแผนฉบับปรับปรุง (Revision)',
    category: 'DATA',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-300',
    dotClass: 'bg-purple-500'
  }
};

export const getPlanActionMeta = (action) => {
  return (
    PLAN_ACTION_META[action] || {
      label: action || 'บันทึกการดำเนินการ',
      category: 'DATA',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
      dotClass: 'bg-slate-400',
      isReturn: false
    }
  );
};

/**
 * Smart Aggregation: Merges sequential VCC_PLAN_ITEM_SAVED logs by the same actor
 * within a 5-minute sliding window (default 300,000ms).
 */
export const aggregateAuditLogs = (history = [], windowMs = 5 * 60 * 1000) => {
  if (!Array.isArray(history) || history.length === 0) return [];

  // Sort chronologically ascending to group sequence correctly
  const sorted = [...history].sort((a, b) => {
    const timeA = new Date(a.at || 0).getTime();
    const timeB = new Date(b.at || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (a.id || 0) - (b.id || 0);
  });

  const aggregated = [];
  let currentGroup = null;

  for (const item of sorted) {
    const itemTime = new Date(item.at || 0).getTime();
    const actorKey = String(item.actor_id || item.actor_name || '').trim();

    if (item.action === 'VCC_PLAN_ITEM_SAVED') {
      if (
        currentGroup &&
        currentGroup.action === 'VCC_PLAN_ITEM_SAVED' &&
        currentGroup.actorKey === actorKey &&
        Math.abs(itemTime - currentGroup.lastTime) <= windowMs
      ) {
        currentGroup.items.push(item);
        currentGroup.lastTime = itemTime;
        currentGroup.lastAt = item.at;
        continue;
      }

      if (currentGroup) {
        aggregated.push(currentGroup);
      }

      currentGroup = {
        isAggregated: true,
        id: `agg-${item.id || itemTime}`,
        action: 'VCC_PLAN_ITEM_SAVED',
        actor_id: item.actor_id,
        actor_name: item.actor_name,
        actorKey,
        firstAt: item.at,
        lastAt: item.at,
        firstTime: itemTime,
        lastTime: itemTime,
        items: [item]
      };
    } else {
      if (currentGroup) {
        aggregated.push(currentGroup);
        currentGroup = null;
      }
      aggregated.push({
        isAggregated: false,
        id: item.id || `single-${itemTime}`,
        action: item.action,
        actor_id: item.actor_id,
        actor_name: item.actor_name,
        at: item.at,
        details: item.details || {},
        originalItem: item
      });
    }
  }

  if (currentGroup) {
    aggregated.push(currentGroup);
  }

  // Reverse back to standard newest-first order
  return aggregated.reverse();
};

/**
 * Slide-over Drawer for Full Audit History Inspection
 */
export const AnnualPlanHistoryDrawer = ({
  open,
  onClose,
  history = [],
  plan = null
}) => {
  const {
    dialogRef,
    requestClose,
    handleBackdropClick
  } = useVccModalAccessibility({
    isOpen: open,
    onClose
  });

  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedKeys, setExpandedKeys] = useState({});

  const aggregatedLogs = useMemo(() => {
    return aggregateAuditLogs(history);
  }, [history]);

  const filteredLogs = useMemo(() => {
    return aggregatedLogs.filter((entry) => {
      const meta = getPlanActionMeta(entry.action);

      // Filter Tab
      if (activeFilter === 'WORKFLOW' && meta.category !== 'WORKFLOW') return false;
      if (activeFilter === 'DATA' && meta.category !== 'DATA') return false;

      // Search keyword
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const actorMatch = (entry.actor_name || entry.actor_id || '').toLowerCase().includes(term);
      const actionMatch = meta.label.toLowerCase().includes(term);
      const reasonMatch = (entry.details?.reason || entry.details?.comment || '').toLowerCase().includes(term);

      let subItemMatch = false;
      if (entry.isAggregated && entry.items) {
        subItemMatch = entry.items.some((sub) => {
          const code = (sub.details?.asset_code || '').toLowerCase();
          const name = (sub.details?.asset_name || '').toLowerCase();
          return code.includes(term) || name.includes(term);
        });
      }

      return actorMatch || actionMatch || reasonMatch || subItemMatch;
    });
  }, [aggregatedLogs, activeFilter, searchTerm]);

  const toggleExpand = (id) => {
    setExpandedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-drawer-title"
      tabIndex="-1"
      className="fixed inset-0 z-50 overflow-hidden outline-none"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={handleBackdropClick}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          ref={dialogRef}
          className="w-screen max-w-xl bg-white shadow-2xl flex flex-col border-l border-slate-200 outline-none"
        >
          {/* Drawer Header */}
          <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                <History size={18} />
              </div>
              <div>
                <h2 id="audit-drawer-title" className="text-base font-bold text-slate-900 leading-tight">
                  ประวัติการดำเนินการฉบับเต็ม (Audit Trail)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {plan ? `${plan.form_code || 'แผนประจำปี'} • ฉบับ ${plan.revision || '01'} (ปี ${plan.plan_year})` : 'บันทึกประวัติการเปลี่ยนแปลงทั้งหมด'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่างประวัติ"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Drawer Toolbar: Search & Filter Tabs */}
          <div className="p-4 bg-white border-b border-slate-200 space-y-3 shrink-0">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่อผู้ดำเนินการ, รหัสเครื่องมือ, หรือเหตุผล..."
                className="w-full h-9.5 pl-9.5 pr-8 rounded-xl border border-slate-200 text-xs sm:text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveFilter('ALL')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg transition-all cursor-pointer text-center ${
                  activeFilter === 'ALL'
                    ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                ทั้งหมด ({history.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('WORKFLOW')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg transition-all cursor-pointer text-center ${
                  activeFilter === 'WORKFLOW'
                    ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                การอนุมัติ/ส่งกลับ
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('DATA')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg transition-all cursor-pointer text-center ${
                  activeFilter === 'DATA'
                    ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                การแก้ไขข้อมูล
              </button>
            </div>
          </div>

          {/* Drawer Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                ไม่พบประวัติการดำเนินการที่ตรงกับเงื่อนไข
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {filteredLogs.map((entry) => (
                  <AuditTimelineItem
                    key={entry.id}
                    entry={entry}
                    isExpanded={Boolean(expandedKeys[entry.id])}
                    onToggleExpand={() => toggleExpand(entry.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/**
 * Individual Timeline Item (Renders aggregated groups or single audit events)
 */
export const AuditTimelineItem = ({ entry, isExpanded, onToggleExpand }) => {
  const meta = getPlanActionMeta(entry.action);

  if (entry.isAggregated) {
    const itemCount = entry.items.length;
    const timeDisplay = formatVccDateTime(entry.lastAt);

    return (
      <div className="relative group text-xs sm:text-sm">
        {/* Timeline Dot Indicator */}
        <div className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ${meta.dotClass} ring-4 ring-white shadow-2xs`} />

        <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/90 rounded-xl p-3 sm:p-3.5 transition-colors">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeClass}`}>
                {meta.label}
              </span>
              <span className="font-semibold text-slate-900">
                ปรับปรุงข้อมูลเครื่องมือ ({itemCount} รายการ)
              </span>
            </div>
            <span className="text-slate-400 font-mono text-[11px] sm:text-xs shrink-0">
              {timeDisplay}
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>โดย {entry.actor_name || entry.actor_id || 'ผู้ใช้งาน'}</span>
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={isExpanded}
              aria-label={`คลี่ดูรายละเอียด ${itemCount} รายการ`}
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer select-none"
            >
              <span>{isExpanded ? 'ย่อรายละเอียด' : 'ดูรายละเอียด'}</span>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Aggregated Child Items Collapsible */}
          {isExpanded && (
            <div
              data-testid="aggregated-items-detail"
              className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-1.5 pl-1"
            >
              {entry.items.map((sub, idx) => {
                const assetCode = sub.details?.asset_code || sub.details?.asset_id || `รายการที่ ${idx + 1}`;
                const assetName = sub.details?.asset_name || '';
                const subTime = formatVccDateTime(sub.at);
                const plannedMonths = sub.details?.planned_months;

                return (
                  <div
                    key={sub.id || idx}
                    className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded-lg bg-white border border-slate-100 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-slate-800 shrink-0">
                        {assetCode}
                      </span>
                      {assetName && (
                        <span className="text-slate-600 truncate font-medium">
                          {assetName}
                        </span>
                      )}
                      {Array.isArray(plannedMonths) && plannedMonths.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-indigo-50 text-indigo-700 rounded font-semibold shrink-0">
                          รอบเดือน: {plannedMonths.join(', ')}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                      {subTime}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Single Audit Event
  const reasonText = entry.details?.reason || entry.details?.comment || '';
  const isReturnAction = meta.isReturn;

  return (
    <div className="relative group text-xs sm:text-sm">
      {/* Timeline Dot Indicator */}
      <div className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ${meta.dotClass} ring-4 ring-white shadow-2xs`} />

      <div
        className={`rounded-xl p-3 sm:p-3.5 border transition-colors ${
          isReturnAction
            ? 'bg-amber-50/40 border-amber-200/80'
            : 'bg-white border-slate-200/90 shadow-2xs'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeClass}`}>
              {meta.label}
            </span>
            {entry.details?.asset_code && (
              <span className="font-mono font-bold text-slate-800">
                {entry.details.asset_code}
              </span>
            )}
            {entry.details?.asset_name && (
              <span className="text-slate-600 font-medium">
                {entry.details.asset_name}
              </span>
            )}
          </div>
          <span className="text-slate-400 font-mono text-[11px] sm:text-xs shrink-0">
            {formatVccDateTime(entry.at)}
          </span>
        </div>

        <div className="mt-1 text-xs text-slate-500">
          <span>โดย {entry.actor_name || entry.actor_id || 'ผู้ใช้งาน'}</span>
        </div>

        {/* Soft Orange Callout Box for Return/Reject Reason */}
        {isReturnAction && reasonText && (
          <div
            data-testid="audit-return-callout"
            className="mt-2.5 p-3 rounded-xl bg-amber-50/90 border border-amber-200/90 text-amber-950 text-xs sm:text-sm space-y-1 shadow-2xs"
          >
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span>เหตุผลการส่งกลับแก้ไข:</span>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed font-medium pl-5 text-slate-800">
              &ldquo;{reasonText}&rdquo;
            </p>
          </div>
        )}

        {/* General Comments on Non-Return Actions */}
        {!isReturnAction && entry.details?.comment && (
          <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <span className="font-semibold text-slate-800">ความเห็น:</span> {entry.details.comment}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * AnnualPlanAuditTrailTimeline — Enterprise Timeline Container
 * Embedded at the bottom of Annual Plan Workspace and Task Detail screens.
 */
export const AnnualPlanAuditTrailTimeline = ({
  history = [],
  plan = null,
  title = 'ประวัติการดำเนินการและหลักฐาน (Audit Trail)',
  defaultCollapsed = false,
  collapsible = true,
  maxHeightClass = 'max-h-80',
  showDrawerButton = true,
  className = ''
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState({});

  // 1. Group logs within 5 minutes
  const aggregatedLogs = useMemo(() => {
    return aggregateAuditLogs(history);
  }, [history]);

  // 2. Count tabs
  const { workflowCount, dataCount } = useMemo(() => {
    let wf = 0;
    let data = 0;
    history.forEach((h) => {
      const meta = getPlanActionMeta(h.action);
      if (meta.category === 'WORKFLOW') wf++;
      else data++;
    });
    return { workflowCount: wf, dataCount: data };
  }, [history]);

  // 3. Filtered logs
  const filteredLogs = useMemo(() => {
    if (activeFilter === 'ALL') return aggregatedLogs;
    return aggregatedLogs.filter((entry) => {
      const meta = getPlanActionMeta(entry.action);
      if (activeFilter === 'WORKFLOW') return meta.category === 'WORKFLOW';
      if (activeFilter === 'DATA') return meta.category === 'DATA';
      return true;
    });
  }, [aggregatedLogs, activeFilter]);

  const toggleExpand = (id) => {
    setExpandedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      data-testid="annual-plan-audit-trail-timeline"
      className={`bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden ${className}`}
    >
      {/* Header Bar */}
      <div className="px-4 sm:px-5 py-3 bg-slate-50/80 border-b border-slate-200/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? 'คลี่ประวัติการดำเนินการ' : 'พับประวัติการดำเนินการ'}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 cursor-pointer transition-colors"
            >
              {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          )}
          <History size={16} className="text-indigo-600 shrink-0" />
          <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
            <span>{title}</span>
            <span className="text-xs px-2 py-0.2 rounded-full font-sans font-semibold bg-slate-200/80 text-slate-700">
              {history.length}
            </span>
          </h3>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Filter Tabs (Only shown when not collapsed) */}
          {!isCollapsed && (
            <div
              role="group"
              aria-label="ตัวกรองประวัติ"
              className="inline-flex items-center gap-1 p-0.5 bg-slate-200/60 rounded-xl text-xs font-semibold"
            >
              <button
                type="button"
                aria-pressed={activeFilter === 'ALL'}
                onClick={() => setActiveFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  activeFilter === 'ALL'
                    ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ทั้งหมด ({history.length})
              </button>
              <button
                type="button"
                aria-pressed={activeFilter === 'WORKFLOW'}
                onClick={() => setActiveFilter('WORKFLOW')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  activeFilter === 'WORKFLOW'
                    ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                การอนุมัติ/ส่งกลับ ({workflowCount})
              </button>
              <button
                type="button"
                aria-pressed={activeFilter === 'DATA'}
                onClick={() => setActiveFilter('DATA')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  activeFilter === 'DATA'
                    ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                การแก้ไขข้อมูล ({dataCount})
              </button>
            </div>
          )}

          {/* Full History Drawer Button */}
          {showDrawerButton && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="ดูประวัติฉบับเต็ม"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              <Maximize2 size={12} className="text-slate-500" />
              <span className="hidden sm:inline">ดูประวัติฉบับเต็ม</span>
            </button>
          )}
        </div>
      </div>

      {/* Timeline Scrollable Body */}
      {!isCollapsed && (
        <div
          data-testid="audit-timeline-body"
          className={`p-4 sm:p-5 overflow-y-auto ${maxHeightClass} space-y-3.5`}
        >
          {filteredLogs.length === 0 ? (
            <p className="text-xs sm:text-sm text-slate-500 text-center py-6">
              ยังไม่มีประวัติการดำเนินการในหมวดนี้
            </p>
          ) : (
            <div className="relative pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {filteredLogs.map((entry) => (
                <AuditTimelineItem
                  key={entry.id}
                  entry={entry}
                  isExpanded={Boolean(expandedKeys[entry.id])}
                  onToggleExpand={() => toggleExpand(entry.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Slide-over Drawer */}
      <AnnualPlanHistoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        history={history}
        plan={plan}
      />
    </div>
  );
};

export default AnnualPlanAuditTrailTimeline;
