import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { TablePagination } from '../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../shared/hooks/useTablePagination';

describe('Global Reusable Table Pagination Engine Tests', () => {
  describe('useTablePagination Hook', () => {
    it('initializes with default page 1 and splits data into slices', () => {
      const sampleData = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
      const { result } = renderHook(() => useTablePagination(sampleData, 10));

      expect(result.current.currentPage).toBe(1);
      expect(result.current.pageSize).toBe(10);
      expect(result.current.totalItems).toBe(25);
      expect(result.current.totalPages).toBe(3);
      expect(result.current.paginatedData).toHaveLength(10);
      expect(result.current.paginatedData[0].id).toBe(1);
      expect(result.current.paginatedData[9].id).toBe(10);
    });

    it('navigates between pages smoothly', () => {
      const sampleData = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
      const { result } = renderHook(() => useTablePagination(sampleData, 10));

      act(() => {
        result.current.setCurrentPage(2);
      });

      expect(result.current.currentPage).toBe(2);
      expect(result.current.paginatedData[0].id).toBe(11);
      expect(result.current.paginatedData[9].id).toBe(20);

      act(() => {
        result.current.setCurrentPage(3);
      });

      expect(result.current.currentPage).toBe(3);
      expect(result.current.paginatedData).toHaveLength(5);
      expect(result.current.paginatedData[0].id).toBe(21);
      expect(result.current.paginatedData[4].id).toBe(25);
    });

    it('resets to page 1 when data length changes (e.g. search filter applied)', () => {
      let data = Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }));
      const { result, rerender } = renderHook(({ items }) => useTablePagination(items, 10), {
        initialProps: { items: data }
      });

      act(() => {
        result.current.setCurrentPage(3);
      });
      expect(result.current.currentPage).toBe(3);

      // Simulate filtering down to 5 items
      data = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
      rerender({ items: data });

      expect(result.current.currentPage).toBe(1);
      expect(result.current.totalItems).toBe(5);
    });
  });

  describe('TablePagination Component', () => {
    it('renders accurate range summary and handles page changes', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(
        <TablePagination
          currentPage={2}
          totalItems={45}
          pageSize={10}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      );

      // Verify range: 11-20 of 45
      expect(screen.getByText(/11–20/i)).toBeInTheDocument();
      expect(screen.getByText(/45/i)).toBeInTheDocument();

      // Click Next
      const nextBtn = screen.getByLabelText(/หน้าถัดไป/i);
      fireEvent.click(nextBtn);
      expect(onPageChange).toHaveBeenCalledWith(3);

      // Click Prev
      const prevBtn = screen.getByLabelText(/หน้าก่อนหน้า/i);
      fireEvent.click(prevBtn);
      expect(onPageChange).toHaveBeenCalledWith(1);

      // Change page size
      const select = screen.getByLabelText(/จำนวนแถวต่อหน้า/i);
      fireEvent.change(select, { target: { value: '25' } });
      expect(onPageSizeChange).toHaveBeenCalledWith(25);
    });

    it('handles empty data set gracefully (0-0 of 0)', () => {
      render(
        <TablePagination
          currentPage={1}
          totalItems={0}
          pageSize={10}
          onPageChange={vi.fn()}
        />
      );

      expect(screen.getByText(/0–0/i)).toBeInTheDocument();
      const prevBtn = screen.getByLabelText(/หน้าก่อนหน้า/i);
      const nextBtn = screen.getByLabelText(/หน้าถัดไป/i);
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeDisabled();
    });
  });
});
