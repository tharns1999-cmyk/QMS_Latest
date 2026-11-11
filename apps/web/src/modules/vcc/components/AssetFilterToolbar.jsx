import React from 'react';
import { Search, X } from 'lucide-react';

export const AssetFilterToolbar = ({
  searchQuery = '',
  onSearchChange,
  filterType = '',
  onFilterTypeChange,
  assetTypes = [],
  canReadAllDepts = false,
  filterDept = '',
  onFilterDeptChange,
  activeDepartments = [],
  onClear,
  activeTab = 'ACTIVE',
  onTabChange,
  counts = { ALL: 0, ACTIVE: 0, ON_HOLD: 0, UNDER_REPAIR: 0, RETIRED: 0 }
}) => {
  const hasActiveFilters = Boolean(searchQuery || filterType || (canReadAllDepts && filterDept));

  const tabs = [
    { key: 'ALL', label: 'ทั้งหมด', count: counts.ALL },
    { key: 'ACTIVE', label: 'ใช้งานปกติ', count: counts.ACTIVE, dot: 'bg-emerald-500' },
    { key: 'ON_HOLD', label: 'ระงับใช้', count: counts.ON_HOLD, dot: 'bg-amber-500' },
    ...(counts.UNDER_REPAIR > 0
      ? [{ key: 'UNDER_REPAIR', label: 'ส่งซ่อม', count: counts.UNDER_REPAIR, dot: 'bg-orange-500' }]
      : []),
    { key: 'RETIRED', label: 'ปลดออกแล้ว', count: counts.RETIRED }
  ];

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-2xs">
      {/* Left: Search & Dropdowns */}
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        <div className="relative flex-1 sm:flex-initial sm:w-56 md:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหารหัส, ชื่อ, Serial... (ค้นหารหัสเครื่องมือ)"
            className="w-full h-8.5 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all"
          />
        </div>

        {canReadAllDepts && (
          <select
            value={filterDept}
            onChange={(e) => onFilterDeptChange(e.target.value)}
            aria-label="กรองตามแผนก"
            className="h-8.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer font-medium"
          >
            <option value="">ทั้งหมดทุกแผนก (All Departments)</option>
            {activeDepartments.map((dept) => (
              <option key={dept.code} value={dept.code}>
                [{dept.code}] {dept.nameTh || dept.nameEn}
              </option>
            ))}
          </select>
        )}

        <select
          value={filterType}
          onChange={(e) => onFilterTypeChange(e.target.value)}
          aria-label="กรองตามประเภท"
          className="h-8.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer font-medium"
        >
          <option value="">ทุกประเภทเครื่องมือ</option>
          {assetTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            aria-label="ล้างตัวกรอง"
            className="inline-flex items-center gap-1 h-8.5 px-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="ล้างตัวกรอง"
          >
            <X size={13} />
            <span>ล้างตัวกรอง</span>
          </button>
        )}
      </div>

      {/* Right: Segmented Status Pills */}
      <div
        role="tablist"
        aria-label="แท็บสถานะเครื่องมือวัด"
        className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200/80 overflow-x-auto self-start lg:self-auto shrink-0"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => onTabChange(tab.key)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.dot && (
                <span className={`w-1.5 h-1.5 rounded-full ${tab.dot}`} />
              )}
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-slate-100 text-slate-800' : 'text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AssetFilterToolbar;
