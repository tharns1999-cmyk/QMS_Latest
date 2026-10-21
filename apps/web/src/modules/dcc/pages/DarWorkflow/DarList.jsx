import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { FilePlus, Edit, Trash2, ClipboardCheck, Eye, Search, X, FileText, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import { isDarDraft, isDarRequester, formatDarDocumentDisplay } from '../../utils/darHelper';
import { DarStatusBadge } from '../../components/ui/StatusBadge';
import { isApiMode } from '../../../../api/client';
import { loadDars } from '../../../../api/dars';

const DarList = () => {
  const navigate = useNavigate();
  const { dars, currentUser, tasks, masterUsers, deleteDar, documents } = useStore();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  // API mode: reviewers and DCC move DARs along, so read the current list on open.
  useEffect(() => {
    if (isApiMode) loadDars().catch(() => {});
  }, []);

  const isAdmin = Boolean(currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN' || currentUser?.isDccAdmin);
  
  const extractDarNumber = (darStr = '') => {
    const match = String(darStr || '').match(/\d+/g);
    return match ? parseInt(match.join(''), 10) : 0;
  };

  // Strict Personal Scoping: "คำร้อง DAR ของฉัน" displays ONLY the current user's requests
  const myDars = (dars || []).filter(dar => isDarRequester(dar, currentUser));

  const filteredDars = myDars.filter(dar => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      dar.darNumber?.toLowerCase().includes(term) ||
      dar.id?.toLowerCase().includes(term) ||
      dar.title?.toLowerCase().includes(term) ||
      dar.type?.toLowerCase().includes(term) ||
      dar.status?.toLowerCase().includes(term) ||
      (dar.department && dar.department.toLowerCase().includes(term))
    );
  });

  const sortedDars = useMemo(() => {
    return [...filteredDars].sort((a, b) => {
      let comparison = 0;

      if (sortConfig.key === 'dar_no') {
        const numA = extractDarNumber(a.darNo || a.darNumber || a.dar_no || a.id);
        const numB = extractDarNumber(b.darNo || b.darNumber || b.dar_no || b.id);
        comparison = numA - numB;
      } else {
        const timeA = new Date(a.createdAt || a.submittedAt || a.date || a.request_date || 0).getTime();
        const timeB = new Date(b.createdAt || b.submittedAt || b.date || b.request_date || 0).getTime();
        comparison = timeA - timeB;

        if (comparison === 0) {
          comparison = extractDarNumber(a.darNo || a.darNumber || a.dar_no || a.id) - extractDarNumber(b.darNo || b.darNumber || b.dar_no || b.id);
        }
      }

      return sortConfig.direction === 'desc' ? -comparison : comparison;
    });
  }, [filteredDars, sortConfig]);

  const handleHeaderSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const pagination = useTablePagination(sortedDars, 30);

  const isMyTask = (t) => t.assigneeId === currentUser?.id || (t.currentHandlerDepartment === currentUser?.department && Number(t.currentHandlerLevel) === Number(currentUser?.level));

  const getCurrentHandler = (dar) => {
    if (dar.status === 'DRAFT') {
      const user = (masterUsers || []).find(u => u.id === dar.requesterId);
      const name = user ? user.name : (dar.requester || dar.requesterId);
      return <span className="text-slate-600 font-medium">{name} (ผู้ร้องขอ)</span>;
    } else if (dar.status === 'APPROVED_WAITING_EFFECTIVE' || dar.status === 'WAITING_EFFECTIVE') {
      return <span className="text-slate-400 font-medium">-</span>;
    } else if (dar.status === 'UNDER_REVIEW' || dar.status === 'PENDING_APPROVAL' || dar.status === 'WAITING_ACKNOWLEDGEMENT') {
      const activeTasks = (tasks || []).filter(t => t.darId === dar.id);
      if (activeTasks.length > 0) {
        const handlerNames = activeTasks.map(t => {
           const user = (masterUsers || []).find(u => u.id === t.assigneeId);
           const role = t.type === 'Review' ? 'ผู้ทบทวน' : t.type === 'Approve' ? 'ผู้อนุมัติ' : 'ผู้รับทราบ';
           if (user) {
             return `${user.name} (${role})`;
           } else {
             let fallbackName = t.assigneeId;
             if (t.assigneeId === 'AUTO' || !t.assigneeId) {
                fallbackName = t.type === 'Review' ? dar.reviewer : t.type === 'Approve' ? dar.approver : 'System';
             }
             return `${fallbackName} (${role})`;
           }
        });
        return <span className="text-[#007BE5] font-medium">{handlerNames.join(', ')}</span>;
      }
      return '-';
    } else if (dar.status === 'RETURNED_FOR_REVISION') {
      const user = (masterUsers || []).find(u => u.id === dar.requesterId);
      const name = user ? user.name : (dar.requester || dar.requesterId);
      return <span className="text-rose-600 font-medium flex items-center gap-1">{name} (ผู้ร้องขอ - แก้ไข)</span>;
    }
    return '-';
  };

  const isDraftDar = (dar) => isDarDraft(dar);

  const renderActionButtons = (dar) => {
    const isRequesterOfDar = isDarRequester(dar, currentUser);
    const activeTask = (tasks || []).find(t => t.darId === dar.id && isMyTask(t));
    
    if (isDraftDar(dar)) {
      return (
        <div className="flex items-center justify-center gap-1">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const basePath = (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') ? '/dcc/dar/new/document' : 
                              (dar.type === 'REVISION' || dar.type === 'REVISE') ? '/dcc/dar/new/revision' : 
                              '/dcc/dar/new/obsolete';
              navigate(`${basePath}?draftId=${encodeURIComponent(dar.id)}`, {
                state: { draftId: dar.id, draftData: dar }
              });
            }}
            className="action-icon-btn text-[#0D99FF] hover:bg-[#E5F4FF]"
            title="ดำเนินการต่อ (Resume Draft)"
          >
            <Edit size={14} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('คุณต้องการลบแบบร่างนี้ทิ้งใช่หรือไม่?')) {
                deleteDar(dar.id);
              }
            }}
            className="action-icon-btn text-slate-400 hover:text-rose-600 hover:bg-rose-50"
            title="ลบทิ้ง (Discard)"
          >
            <Trash2 size={14} />
          </button>
        </div>
      );
    }
    
    if (activeTask) {
      const taskRoute = activeTask.type === 'Review' ? `/tasks/review/${activeTask.id}` : 
                        activeTask.type === 'Approve' ? `/tasks/approve/${activeTask.id}` :
                        activeTask.type === 'DCC_PUBLISH' ? `/dar/${dar.id}` : `/tasks/ack/${activeTask.id}`;
      return (
        <div className="flex items-center justify-center">
          <button 
            onClick={(e) => { e.stopPropagation(); navigate(taskRoute); }}
            className="action-icon-btn text-[#0D99FF] hover:bg-[#E5F4FF]"
            title="ดำเนินการ (Process Task)"
          >
            <ClipboardCheck size={15} />
          </button>
        </div>
      );
    }

    if (isAdmin && (dar.status === 'APPROVED_WAITING_EFFECTIVE' || dar.status === 'WAITING_EFFECTIVE')) {
      return (
        <div className="flex items-center justify-center">
          <button 
            onClick={(e) => { e.stopPropagation(); navigate(`/tasks`); }}
            className="action-icon-btn text-purple-600 hover:bg-purple-50"
            title="ดำเนินการ DCC (Verify & Distribute)"
          >
            <ClipboardCheck size={15} />
          </button>
        </div>
      );
    }

    if (dar.status === 'RETURNED_FOR_REVISION' && isRequesterOfDar) {
      return (
        <div className="flex items-center justify-center">
          <button 
            onClick={(e) => { e.stopPropagation(); navigate(`/tasks/revise/${dar.id}`); }}
            className="action-icon-btn text-amber-600 hover:bg-amber-50"
            title="แก้ไขคำขอ (Revise DAR)"
          >
            <Edit size={14} />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center">
        <button 
          onClick={(e) => { e.stopPropagation(); navigate(`/dar/${dar.id}`); }}
          className="action-icon-btn text-slate-400 hover:text-slate-700"
          title="ดูรายละเอียด (View Details)"
        >
          <Eye size={14} />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-4 w-full max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1E1E1E] tracking-tight">คำร้อง DAR ของฉัน (My DAR Requests)</h2>
          <p className="text-xs text-[#666666] mt-0.5">รายการคำร้องขอจัดการเอกสารที่คุณเป็นผู้ยื่นคำร้อง ติดตามสถานะและจัดการฉบับร่างของคุณ</p>
        </div>
        <button 
          onClick={() => navigate('/dar/new')}
          className="btn-primary"
        >
          <FilePlus size={16} /> สร้างคำร้อง DAR ใหม่
        </button>
      </div>

      {/* Filter and Search */}
      <div className="card-surface p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:w-80">
            <Search className="text-[#999999] absolute left-3.5 top-1/2 -translate-y-1/2" size={16} />
            <input
              type="text"
              placeholder="ค้นหาเลขที่ DAR, ชื่อเอกสาร, ประเภท, สถานะ..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                pagination.setCurrentPage(1);
              }}
              className="w-full pl-10 pr-8 py-2 h-10 text-sm bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg focus:bg-white focus:border-[#0D99FF] outline-none transition-all font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); pagination.setCurrentPage(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <select
            value={`${sortConfig.key}_${sortConfig.direction}`}
            onChange={(e) => {
              const [key, direction] = e.target.value.split('_');
              setSortConfig({ key, direction });
            }}
            className="w-full sm:w-auto py-2 px-3 h-10 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:bg-white focus:border-[#0D99FF] transition-all cursor-pointer"
          >
            <option value="date_desc">เรียง: ล่าสุดก่อน (ใหม่ → เก่า)</option>
            <option value="date_asc">เรียง: เก่าสุดก่อน (เก่า → ใหม่)</option>
            <option value="dar_no_desc">เลขที่ DAR (มาก → น้อย)</option>
            <option value="dar_no_asc">เลขที่ DAR (น้อย → มาก)</option>
          </select>
        </div>

        <div className="text-sm text-[#666666] font-medium">
          พบทั้งหมด <span className="font-bold text-slate-800 font-mono">{filteredDars.length}</span> รายการ
        </div>
      </div>

      {/* Table */}
      <div className="w-full bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-2xs flex flex-col min-h-0 h-auto">
        <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full max-w-full scrollbar-thin">
          <table className="w-full text-left text-sm border-collapse min-w-[960px]">
            <thead className="table-header sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0] shadow-xs backdrop-blur-sm whitespace-nowrap">
              <tr>
                <th className="px-3.5 py-3 w-20 min-w-[80px] text-center bg-[#F8FAFC]">การจัดการ</th>
                <th 
                  onClick={() => handleHeaderSort('dar_no')}
                  className="px-3.5 py-3 w-40 min-w-[140px] bg-[#F8FAFC] font-semibold text-slate-600 cursor-pointer select-none hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-1.5 font-mono">
                    <span>เลขที่ DAR</span>
                    {sortConfig.key === 'dar_no' ? (
                      sortConfig.direction === 'desc' ? <ArrowDown className="w-3.5 h-3.5 text-[#0D99FF]"/> : <ArrowUp className="w-3.5 h-3.5 text-[#0D99FF]"/>
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-50"/>
                    )}
                  </div>
                </th>
                <th className="px-3.5 py-3 min-w-[220px] bg-[#F8FAFC]">ชื่อเอกสาร / หัวข้อ</th>
                <th className="px-3.5 py-3 w-28 min-w-[100px] bg-[#F8FAFC]">ประเภท</th>
                {isAdmin && <th className="px-3.5 py-3 w-24 min-w-[80px] bg-[#F8FAFC]">แผนก</th>}
                <th className="px-3.5 py-3 w-36 min-w-[130px] bg-[#F8FAFC]">สถานะ</th>
                <th className="px-3.5 py-3 w-48 min-w-[160px] bg-[#F8FAFC]">ผู้รับผิดชอบปัจจุบัน</th>
                <th 
                  onClick={() => handleHeaderSort('date')}
                  className="px-3.5 py-3 w-32 min-w-[110px] text-right bg-[#F8FAFC] font-semibold text-slate-600 cursor-pointer select-none hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5 font-mono">
                    {sortConfig.key === 'date' ? (
                      sortConfig.direction === 'desc' ? <ArrowDown className="w-3.5 h-3.5 text-[#0D99FF]"/> : <ArrowUp className="w-3.5 h-3.5 text-[#0D99FF]"/>
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-50"/>
                    )}
                    <span>วันที่ยื่น</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagination.paginatedData.map((dar) => (
                <tr 
                  key={dar.id} 
                  className="hover:bg-[#F8FAFC] transition-colors cursor-pointer" 
                  onClick={() => {
                    if (isDraftDar(dar)) {
                      const basePath = (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') ? '/dcc/dar/new/document' : 
                                      (dar.type === 'REVISION' || dar.type === 'REVISE') ? '/dcc/dar/new/revision' : 
                                      '/dcc/dar/new/obsolete';
                      navigate(`${basePath}?draftId=${encodeURIComponent(dar.id)}`, {
                        state: { draftId: dar.id, draftData: dar }
                      });
                    } else {
                      navigate(`/dar/${dar.id}`);
                    }
                  }}
                >
                  <td className="px-3 py-2.5 text-center">
                    {renderActionButtons(dar)}
                  </td>
                  <td className="px-3.5 py-3 whitespace-nowrap">
                    {isDraftDar(dar) ? (
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          const basePath = (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') ? '/dcc/dar/new/document' : 
                                          (dar.type === 'REVISION' || dar.type === 'REVISE') ? '/dcc/dar/new/revision' : 
                                          '/dcc/dar/new/obsolete';
                          navigate(`${basePath}?draftId=${encodeURIComponent(dar.id)}`, {
                            state: { draftId: dar.id, draftData: dar }
                          });
                        }}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 cursor-pointer transition-colors"
                        title="คลิกเพื่อแก้ไขแบบร่างต่อ"
                      >
                        ฉบับร่าง (Draft)
                      </span>
                    ) : (
                      <span className="font-mono font-bold text-[#0D99FF] text-sm sm:text-[15px] hover:underline">
                        {dar.darNumber || (String(dar.id).startsWith('draft_') ? 'ฉบับร่าง (Draft)' : dar.id)}
                      </span>
                    )}
                  </td>
                  {/* คอลัมน์ ชื่อเอกสาร / หัวข้อ */}
                  <td className="px-3.5 py-3 align-middle min-w-[200px]">
                    {(() => {
                      const { docCode, docTitle } = formatDarDocumentDisplay(dar, documents);
                      return (
                        <div className="flex flex-col min-w-0">
                          {/* บรรทัดที่ 1: รหัสเอกสาร */}
                          <span className="text-sm font-semibold text-slate-800 leading-tight">
                            {docCode}
                          </span>
                          {/* บรรทัดที่ 2: ชื่อเอกสารจริง (ตัด tag [OBSOLETE] ออกถ้ามีหลงเหลือ) */}
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
                  <td className="px-3.5 py-3 whitespace-nowrap">
                    <span className="px-2.5 py-1 bg-[#F5F5F5] text-slate-700 rounded-lg font-mono text-xs font-bold">
                      {dar.type}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-3.5 py-3 text-slate-700 font-bold font-mono text-xs sm:text-sm">
                      {dar.department}
                    </td>
                  )}
                  <td className="px-3.5 py-3 whitespace-nowrap">
                    <DarStatusBadge status={dar.status} />
                  </td>
                  <td className="px-3.5 py-3 text-slate-700 whitespace-nowrap min-w-0 truncate text-xs sm:text-sm">
                    {getCurrentHandler(dar)}
                  </td>
                  <td className="px-3.5 py-3 text-[#666666] text-right font-mono text-xs sm:text-sm whitespace-nowrap">
                    {dar.date}
                  </td>
                </tr>
              ))}
              {pagination.paginatedData.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-6 py-14 text-center text-[#888888]">
                    <FileText className="w-10 h-10 text-[#CCCCCC] mx-auto mb-2" strokeWidth={1.5} />
                    <p className="text-xs font-medium text-[#888888]">
                      {searchTerm ? 'ไม่พบรายการคำร้อง DAR ที่ตรงกับเงื่อนไขการค้นหา' : 'ไม่พบรายการคำร้อง DAR ที่คุณเป็นผู้ยื่น'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Universal Pagination */}
        <TablePagination
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
          pageSizeOptions={[10, 25, 30, 50, 100]}
        />
      </div>
    </div>
  );
};

export default DarList;
