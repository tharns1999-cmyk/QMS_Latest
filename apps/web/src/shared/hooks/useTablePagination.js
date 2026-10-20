import { useState, useMemo, useEffect } from 'react';

/**
 * useTablePagination Hook
 * Provides pagination state and slice calculations for data tables.
 *
 * @param {Array} data - Filtered source array of items
 * @param {number} initialPageSize - Default rows per page (default: 10)
 * @returns {Object} { currentPage, setCurrentPage, pageSize, setPageSize, paginatedData, totalItems, totalPages }
 */
export const useTablePagination = (data = [], initialPageSize = 10) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Automatically reset to page 1 whenever data length changes (e.g. searching/filtering)
  useEffect(() => {
    setCurrentPage(1);
  }, [data.length]);

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

  // Guard against currentPage exceeding totalPages (e.g. after data shrinkage)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, currentPage, pageSize]);

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedData,
    totalItems: data.length,
    totalPages
  };
};

export default useTablePagination;
