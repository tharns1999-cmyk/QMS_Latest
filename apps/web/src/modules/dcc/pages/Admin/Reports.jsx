import React from 'react';
import useStore from '../../../../store/useStore';
import toast from 'react-hot-toast';
import { Download, FileText, AlertTriangle } from 'lucide-react';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import { isDarDraft, formatDarDocumentDisplay, getDarStatusBadgeMeta } from '../../utils/darHelper';

const Reports = () => {
  const { dars, tasks, documents } = useStore();
  
  const submittedDars = (dars || []).filter(d => !isDarDraft(d));
  const darPagination = useTablePagination(submittedDars, 10);
  const overdueTasks = (tasks || []).filter(t => t.status === 'OVERDUE');
  const overduePagination = useTablePagination(overdueTasks, 10);

  const handleExport = (reportName) => {
    toast.success(`กำลังส่งออกรายงาน ${reportName} เป็นไฟล์ CSV...`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 w-full max-w-full overflow-hidden">
      <div>
        <h2 className="text-xl font-bold text-[#1E1E1E] tracking-tight">รายงานและสถิติ (Reports & Analytics)</h2>
        <p className="text-xs text-[#666666] mt-0.5">ศูนย์รวมรายงานวิเคราะห์สำหรับผู้บริหารและฝ่ายควบคุมคุณภาพ QMS</p>
      </div>

      {/* 1. DAR Register Summary */}
      <div className="card-surface p-6 space-y-4 flex flex-col min-h-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#E5F4FF] text-[#0D99FF] rounded-xl">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1E1E1E]">DAR Register Summary</h3>
              <p className="text-xs text-slate-400">ทะเบียนสรุปคำขอดำเนินการเอกสารทั้งหมด</p>
            </div>
          </div>
          <button 
            onClick={() => handleExport('DAR Register')}
            className="btn-secondary text-xs py-2 cursor-pointer"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
        
        <div className="w-full bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-2xs flex flex-col min-h-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[400px] w-full scrollbar-thin">
            <table className="w-full text-left text-xs table-fixed border-collapse">
              <thead className="table-header sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0] shadow-xs backdrop-blur-sm whitespace-nowrap">
                <tr>
                  <th className="px-4 py-3 w-32 font-mono bg-[#F8FAFC]">DAR ID</th>
                  <th className="px-4 py-3 bg-[#F8FAFC]">Title</th>
                  <th className="px-4 py-3 w-24 bg-[#F8FAFC]">Type</th>
                  <th className="px-4 py-3 w-32 bg-[#F8FAFC]">Status</th>
                  <th className="px-4 py-3 w-28 text-right font-mono bg-[#F8FAFC]">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {darPagination.paginatedData.map((dar) => (
                  <tr key={dar.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-[#0D99FF] text-sm sm:text-[15px]">{dar.id}</td>
                    <td className="px-4 py-3 align-middle min-w-0">
                      {(() => {
                        const { docCode, docTitle } = formatDarDocumentDisplay(dar, documents);
                        return (
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-slate-800 leading-tight">
                              {docCode}
                            </span>
                            <span 
                              className="text-xs text-slate-500 line-clamp-1 leading-normal mt-0.5" 
                              title={docTitle}
                            >
                              {docTitle}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 bg-[#F5F5F5] text-slate-700 rounded-lg font-mono font-bold text-xs">
                        {dar.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const meta = getDarStatusBadgeMeta(dar.status);
                        return <span className={meta.className}>{meta.label}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#666666] text-xs sm:text-sm">{dar.date}</td>
                  </tr>
                ))}
                {darPagination.paginatedData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">
                      ไม่พบรายการคำขอ DAR
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={darPagination.currentPage}
            totalItems={darPagination.totalItems}
            pageSize={darPagination.pageSize}
            onPageChange={darPagination.setCurrentPage}
            onPageSizeChange={darPagination.setPageSize}
          />
        </div>
      </div>

      {/* 2. Task Overdue Report */}
      <div className="card-surface p-6 space-y-4 flex flex-col min-h-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1E1E1E]">Task Overdue Report</h3>
              <p className="text-xs text-slate-400">รายการงานที่เกินกำหนดเวลา SLA ประจำแผนก</p>
            </div>
          </div>
          <button 
            onClick={() => handleExport('Task Overdue')}
            className="btn-secondary text-xs py-2 cursor-pointer"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
        
        <div className="w-full bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-2xs flex flex-col min-h-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[400px] w-full scrollbar-thin">
            <table className="w-full text-left text-xs table-fixed border-collapse">
              <thead className="table-header sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0] shadow-xs backdrop-blur-sm whitespace-nowrap">
                <tr>
                  <th className="px-4 py-3 w-32 font-mono bg-[#F8FAFC]">Task ID</th>
                  <th className="px-4 py-3 w-32 font-mono bg-[#F8FAFC]">DAR ID</th>
                  <th className="px-4 py-3 bg-[#F8FAFC]">Assignee</th>
                  <th className="px-4 py-3 w-28 font-mono bg-[#F8FAFC]">Due Date</th>
                  <th className="px-4 py-3 w-28 text-center bg-[#F8FAFC]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overduePagination.paginatedData.map((task) => (
                  <tr key={task.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-2.5 font-mono font-bold text-[#1E1E1E]">{task.id}</td>
                    <td className="px-4 py-2.5 font-mono text-[#0D99FF]">{task.darId || '-'}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{task.assigneeId}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-rose-600">{task.dueDate}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="badge-rejected">
                        OVERDUE
                      </span>
                    </td>
                  </tr>
                ))}
                {overduePagination.paginatedData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">
                      ไม่มีรายการงานที่เกินกำหนดเวลา (All tasks on schedule)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={overduePagination.currentPage}
            totalItems={overduePagination.totalItems}
            pageSize={overduePagination.pageSize}
            onPageChange={overduePagination.setCurrentPage}
            onPageSizeChange={overduePagination.setPageSize}
          />
        </div>
      </div>
    </div>
  );
};

export default Reports;
