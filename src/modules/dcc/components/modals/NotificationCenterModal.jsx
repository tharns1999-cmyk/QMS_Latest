import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  CheckCheck, 
  Search, 
  X, 
  FileText, 
  Copy, 
  Settings, 
  ExternalLink,
  Clock,
  Globe
} from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import useStore, { isNotificationVisibleToUser, isNotificationReadByUser } from '../../../../store/useStore';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import toast from 'react-hot-toast';
import { resolveNotificationNavigation } from '../../utils/notificationRouter';

dayjs.extend(relativeTime);

/**
 * NotificationCenterModal
 * Enterprise Notification Architecture & Lifecycle Management Modal.
 * Provides rich filtering (Tabs & Search), pagination, and instant mark-as-read.
 */
const EMPTY_NOTIFICATIONS = [];

export const NotificationCenterModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const store = useStore();
  
  const notifications = store.notifications || EMPTY_NOTIFICATIONS;
  const currentUser = store.currentUser;
  const markAsRead = store.markAsRead || store.markNotificationAsRead;
  const markAllAsRead = store.markAllAsRead || store.markAllNotificationsAsRead;

  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'UNREAD' | 'DAR' | 'CONTROLLED_COPY' | 'SYSTEM'
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Filter notifications for current user, category, and search query
  const filteredNotifications = useMemo(() => {
    return notifications
      .filter((item) => {
        // Must belong to current user or be general broadcast
        if (!isNotificationVisibleToUser(item, currentUser)) return false;

        // Unread check
        const isUnread = !isNotificationReadByUser(item, currentUser?.id);

        // Category / Tab filter
        if (activeTab === 'UNREAD' && !isUnread) return false;
        
        const cat = item.category || (
          item.title?.includes('DAR') ? 'DAR' :
          (item.title?.includes('สำเนา') || item.title?.includes('ทดแทน')) ? 'CONTROLLED_COPY' :
          (item.title?.includes('เอกสารภายนอก') || item.message?.includes('เอกสารภายนอก') || item.link?.includes('external')) ? 'EXTERNAL_DOC' : 'SYSTEM'
        );

        if (activeTab === 'DAR' && cat !== 'DAR') return false;
        if (activeTab === 'EXTERNAL_DOC' && cat !== 'EXTERNAL_DOC') return false;
        if (activeTab === 'CONTROLLED_COPY' && cat !== 'CONTROLLED_COPY') return false;
        if (activeTab === 'SYSTEM' && cat !== 'SYSTEM') return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = item.title?.toLowerCase().includes(q);
          const matchMsg = (item.message || item.description || '')?.toLowerCase().includes(q);
          const matchCat = cat?.toLowerCase().includes(q);
          if (!matchTitle && !matchMsg && !matchCat) return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.timestamp || b.created_at || b.createdAt || 0) - new Date(a.timestamp || a.created_at || a.createdAt || 0));
  }, [notifications, currentUser, activeTab, searchQuery]);

  // Unread count for current user
  const totalUnreadCount = useMemo(() => {
    return notifications.filter((n) => {
      return isNotificationVisibleToUser(n, currentUser) && !isNotificationReadByUser(n, currentUser?.id);
    }).length;
  }, [notifications, currentUser]);

  // 2. Pagination Hook
  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedData,
    totalItems
  } = useTablePagination(filteredNotifications, 10);

  if (!isOpen) return null;

  const handleItemClick = (item) => {
    if (markAsRead && item.id) {
      markAsRead(item.id, currentUser?.id);
    }
    onClose();
    const target = resolveNotificationNavigation(item, store);
    navigate(target.path, { state: target.state });
  };

  const handleMarkAllRead = () => {
    if (markAllAsRead) {
      markAllAsRead(currentUser?.id);
      toast.success('ทำเครื่องหมายว่าอ่านแล้วทั้งหมด');
    }
  };

  const getCategoryBadge = (item) => {
    const cat = item.category || (
      item.title?.includes('DAR') ? 'DAR' :
      (item.title?.includes('สำเนา') || item.title?.includes('ทดแทน')) ? 'CONTROLLED_COPY' :
      (item.title?.includes('เอกสารภายนอก') || item.message?.includes('เอกสารภายนอก') || item.link?.includes('external')) ? 'EXTERNAL_DOC' : 'SYSTEM'
    );

    switch (cat) {
      case 'DAR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#F0EDFF] text-[#7B61FF] border border-[#D5CDFF]">
            <FileText size={11} />
            <span>คำร้อง DAR</span>
          </span>
        );
      case 'EXTERNAL_DOC':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#E0F2FE] text-[#0284C7] border border-[#BAE6FD]">
            <Globe size={11} />
            <span>เอกสารภายนอก</span>
          </span>
        );
      case 'CONTROLLED_COPY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#FFF4E5] text-[#D97706] border border-[#FDE68A]">
            <Copy size={11} />
            <span>สำเนาควบคุม</span>
          </span>
        );
      case 'SYSTEM':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#E5F4FF] text-[#0D99FF] border border-[#B8E1FF]">
            <Settings size={11} />
            <span>ระบบ</span>
          </span>
        );
    }
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#E5F4FF] rounded-xl text-[#0D99FF] border border-[#B8E1FF] flex items-center justify-center shrink-0">
              <Bell size={20} strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#1E293B]">ศูนย์ประวัติการแจ้งเตือน (Notification Center)</h2>
                {totalUnreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#0D99FF] text-white">
                    {totalUnreadCount} ยังไม่อ่าน
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                ประวัติการแจ้งเตือน กิจกรรม และสถานะคำร้องที่เกี่ยวข้องกับบัญชีของคุณ ({currentUser?.name || 'ผู้ใช้'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1E293B] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar: Tabs, Search & Actions */}
        <div className="px-6 py-3 border-b border-[#F1F5F9] flex flex-wrap items-center justify-between gap-3 shrink-0 bg-white">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 bg-[#F1F5F9] p-1 rounded-xl text-xs font-semibold overflow-x-auto">
            {[
              { id: 'ALL', label: 'ทั้งหมด' },
              { id: 'UNREAD', label: `ยังไม่อ่าน ${totalUnreadCount > 0 ? `(${totalUnreadCount})` : ''}` },
              { id: 'DAR', label: 'คำร้อง DAR' },
              { id: 'EXTERNAL_DOC', label: 'เอกสารภายนอก' },
              { id: 'CONTROLLED_COPY', label: 'สำเนาควบคุม' },
              { id: 'SYSTEM', label: 'ระบบ' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-[#0D99FF] shadow-xs font-bold'
                    : 'text-[#64748B] hover:text-[#1E293B]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Bar & Action Buttons */}
          <div className="flex items-center gap-2.5 flex-1 sm:flex-initial justify-end">
            <div className="relative min-w-[200px] sm:w-56">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาข้อความแจ้งเตือน..."
                className="w-full h-8 pl-8 pr-7 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#0D99FF] focus:bg-white text-[#1E293B] placeholder-[#94A3B8] transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={totalUnreadCount === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
            >
              <CheckCheck className="text-[#0D99FF]" size={14} />
              <span>อ่านทั้งหมดแล้ว</span>
            </button>
          </div>
        </div>

        {/* Scrollable Notification List Area */}
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-[#F1F5F9] p-2 custom-scrollbar bg-[#FAFAFA]/50">
          {paginatedData.length === 0 ? (
            <div className="py-24 text-center">
              <Bell className="mx-auto text-[#CBD5E1] mb-3" size={40} strokeWidth={1.5} />
              <p className="text-sm font-bold text-[#64748B]">ไม่พบรายการแจ้งเตือน</p>
              <p className="text-xs text-[#94A3B8] mt-1">ไม่มีรายการแจ้งเตือนตรงตามเงื่อนไขหรือหมวดหมู่ที่เลือก</p>
            </div>
          ) : (
            paginatedData.map((item) => {
              const isUnread = !isNotificationReadByUser(item, currentUser?.id);
              const timeDisplay = item.timestamp || item.created_at || item.createdAt
                ? dayjs(item.timestamp || item.created_at || item.createdAt).fromNow()
                : (item.time || 'เมื่อสักครู่');

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`p-4 rounded-xl flex items-start justify-between gap-4 transition-all cursor-pointer m-1 border ${
                    isUnread
                      ? 'bg-white border-[#B8E1FF]/80 shadow-xs hover:border-[#0D99FF]'
                      : 'bg-white/80 border-[#E2E8F0]/70 hover:bg-white hover:border-[#CBD5E1]'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="mt-1 shrink-0">
                      {isUnread ? (
                        <span className="block w-2.5 h-2.5 rounded-full bg-[#0D99FF] ring-4 ring-[#0D99FF]/15" />
                      ) : (
                        <span className="block w-2.5 h-2.5 rounded-full bg-[#CBD5E1]" />
                      )}
                    </div>
                    
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs ${isUnread ? 'font-bold text-[#1E293B]' : 'font-semibold text-[#475569]'}`}>
                          {item.title}
                        </span>
                        {getCategoryBadge(item)}
                      </div>
                      <p className="text-xs text-[#475569] leading-relaxed break-words">
                        {item.message || item.description}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    <span className="text-[11px] font-mono text-[#94A3B8] flex items-center gap-1">
                      <Clock size={11} />
                      {timeDisplay}
                    </span>
                    {item.link && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0D99FF] hover:underline">
                        <span>เปิดดู</span>
                        <ExternalLink size={11} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Universal Pagination Footer */}
        <TablePagination
          currentPage={currentPage}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default NotificationCenterModal;
