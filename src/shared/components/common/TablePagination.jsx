import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const TablePagination = ({
  currentPage = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = ''
}) => {
  const safePageSize = Math.max(1, Number(pageSize) || 10);
  const safeTotalItems = Math.max(0, Number(totalItems) || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / safePageSize));
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), totalPages);
  const startItem = safeTotalItems === 0 ? 0 : (safeCurrentPage - 1) * safePageSize + 1;
  const endItem = Math.min(safeCurrentPage * safePageSize, safeTotalItems);

  return (
    <div
      data-testid="table-pagination"
      className={`h-12 bg-[#F8FAFC] border-t border-[#E2E8F0] px-4 flex flex-wrap items-center justify-between gap-3 shrink-0 select-none ${className}`}
    >
      {/* Left: Item count summary & Page size selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[#64748B]">
          แสดง <strong className="text-[#1E293B] font-mono">{startItem}–{endItem}</strong> จากทั้งหมด{' '}
          <strong className="text-[#1E293B] font-mono">{totalItems}</strong> รายการ
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
            <span>แถวต่อหน้า:</span>
            <select
              aria-label="จำนวนแถวต่อหน้า"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 px-2 bg-white border border-[#CBD5E1] rounded-md text-xs font-medium text-[#1E293B] focus:outline-none focus:border-[#0D99FF] cursor-pointer"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Navigation Controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="หน้าก่อนหน้า"
          disabled={safeCurrentPage <= 1}
          onClick={() => onPageChange && onPageChange(safeCurrentPage - 1)}
          className="p-1.5 rounded-md border border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-35 disabled:cursor-not-allowed transition-all cursor-pointer"
          title="หน้าก่อนหน้า"
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 1)
          .map((page, idx, arr) => {
            const prevPage = arr[idx - 1];
            return (
              <React.Fragment key={page}>
                {prevPage && page - prevPage > 1 && (
                  <span className="px-1 text-xs text-[#94A3B8]">...</span>
                )}
                <button
                  type="button"
                  aria-label={`หน้าที่ ${page}`}
                  onClick={() => onPageChange && onPageChange(page)}
                  className={`min-w-[28px] h-7 px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    safeCurrentPage === page
                      ? 'bg-[#0D99FF] text-white font-bold shadow-2xs'
                      : 'bg-white border border-[#CBD5E1] text-[#334155] hover:bg-[#F1F5F9]'
                  }`}
                >
                  {page}
                </button>
              </React.Fragment>
            );
          })}

        <button
          type="button"
          aria-label="หน้าถัดไป"
          disabled={safeCurrentPage >= totalPages}
          onClick={() => onPageChange && onPageChange(safeCurrentPage + 1)}
          className="p-1.5 rounded-md border border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-35 disabled:cursor-not-allowed transition-all cursor-pointer"
          title="หน้าถัดไป"
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

export default TablePagination;
