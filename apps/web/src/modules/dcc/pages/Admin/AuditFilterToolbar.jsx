import React from 'react';
import { Search, X, Activity } from 'lucide-react';
import { AUDIT_MODULES, AUDIT_TAXONOMY } from './auditTaxonomy';

const AuditFilterToolbar = ({
  searchTerm = '',
  onSearchChange = () => {},
  selectedModule = 'ALL',
  onModuleChange = () => {},
  selectedCategory = 'ALL',
  onCategoryChange = () => {},
  dateFrom = '',
  dateTo = '',
  onDateFromChange = () => {},
  onDateToChange = () => {},
  onClearDate = () => {},
  categoryCounts = {}
}) => {
  const currentCategories = AUDIT_TAXONOMY[selectedModule]?.categories || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 sm:p-5 space-y-3.5" data-testid="audit-filter-toolbar">
      {/* Row 1: Unified Filter Bar (Search, Module Dropdown, Subcategory Dropdown, Date Range) */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Left: Search input (40-45% width on large screens) */}
        <div className="relative flex-1 lg:max-w-[45%]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="ค้นหาตาม action, ชื่อผู้ใช้งาน, รหัสเอกสาร/เครื่องมือ, หรือรายละเอียด..."
            className="w-full pl-9 pr-8 h-9 text-xs sm:text-sm bg-slate-50/80 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-hidden text-slate-900 placeholder:text-slate-400 transition-colors"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
              title="ล้างคำค้นหา"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Center & Right Controls: Module select, Subcategory select, Date range */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Module Select Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 hidden sm:inline select-none">โมดูล:</span>
            <select
              aria-label="เลือกโมดูล"
              data-testid="audit-module-select"
              value={selectedModule}
              onChange={(e) => {
                onModuleChange(e.target.value);
              }}
              className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500 transition-colors cursor-pointer shadow-2xs"
            >
              {AUDIT_MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sub-category Select Dropdown (Dynamic based on selectedModule) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 hidden sm:inline select-none">หมวดหมู่:</span>
            <select
              aria-label="เลือกหมวดหมู่ย่อย"
              data-testid="audit-subcategory-select"
              value={selectedCategory}
              onChange={(e) => onCategoryChange(e.target.value)}
              disabled={selectedModule === 'ALL'}
              className={`h-9 px-2.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer shadow-2xs ${
                selectedModule === 'ALL'
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-white text-slate-800 border-slate-200 focus:outline-hidden focus:border-indigo-500'
              }`}
            >
              {selectedModule === 'ALL' ? (
                <option value="ALL">ทุกหมวดหมู่ (เลือกโมดูลก่อน)</option>
              ) : (
                currentCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} {categoryCounts[c.id] !== undefined ? `(${categoryCounts[c.id]})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50/70 p-1 rounded-xl border border-slate-200/60">
            <input
              type="date"
              aria-label="วันที่เริ่มต้น"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-7 px-2 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-800 focus:outline-hidden focus:border-indigo-500"
            />
            <span className="text-slate-400 text-[11px]">ถึง</span>
            <input
              type="date"
              aria-label="วันที่สิ้นสุด"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-7 px-2 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-800 focus:outline-hidden focus:border-indigo-500"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={onClearDate}
                className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer font-medium"
                title="ล้างช่วงวันที่"
              >
                ล้าง
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Contextual Quick Chips (Shown strictly when a specific module is selected) */}
      {selectedModule !== 'ALL' && currentCategories.length > 0 && (
        <div 
          className="flex items-center gap-1.5 flex-wrap pt-2.5 border-t border-slate-100"
          data-testid="audit-quick-chips"
        >
          <span className="text-[11px] font-medium text-slate-400 mr-1 select-none">หมวดหมู่ย่อย:</span>
          {currentCategories.map((cat) => {
            const Icon = cat.icon || Activity;
            const isActive = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] ?? 0;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-semibold'
                    : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200/80'
                }`}
              >
                <Icon size={13} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span>{cat.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-white/20 text-white font-bold' : 'bg-slate-200/70 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AuditFilterToolbar;
