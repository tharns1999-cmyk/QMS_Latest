import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import useStore, { isNotificationVisibleToUser, isNotificationReadByUser } from '../../store/useStore';
import { NotificationCenterModal } from '../../modules/dcc/components/modals/NotificationCenterModal';
import { resolveNotificationNavigation } from '../../modules/dcc/utils/notificationRouter';

dayjs.extend(relativeTime);

/**
 * NotificationPopover - Figma UI3 floating panel for system notifications
 * Provides wide comfortable layout (w-88 / w-96), visual hierarchy,
 * unread badges, mark-all-read action, and full NotificationCenterModal history.
 * Rendered via createPortal to eliminate overflow clipping traps.
 */
const EMPTY_NOTIFICATIONS = [];

const NotificationPopover = ({
  notifications: propNotifications,
  unreadCount: propUnreadCount,
  onMarkAllAsRead: propOnMarkAllAsRead,
  onNotificationClick: propOnNotificationClick,
  onViewAll: propOnViewAll,
  compact = false,
  triggerVariant = 'default', // 'default' | 'compact' | 'menu-row'
  className = ''
}) => {
  const navigate = useNavigate();
  const store = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  // Extract from store if props not explicitly passed
  const currentUser = store?.currentUser;
  const rawNotifications = propNotifications !== undefined ? propNotifications : (store?.notifications || EMPTY_NOTIFICATIONS);
  const markNotificationAsRead = store?.markNotificationAsRead || store?.markAsRead;
  const markAllNotificationsAsRead = store?.markAllNotificationsAsRead || store?.markAllAsRead;

  // Filter for current user and sort newest first
  const userNotis = React.useMemo(() => {
    if (propNotifications !== undefined) return propNotifications;
    return (rawNotifications || [])
      .filter(n => isNotificationVisibleToUser(n, currentUser))
      .sort((a, b) => new Date(b.timestamp || b.created_at || b.createdAt || 0) - new Date(a.timestamp || a.created_at || a.createdAt || 0));
  }, [rawNotifications, currentUser, propNotifications]);

  const unreadCount = propUnreadCount !== undefined 
    ? propUnreadCount 
    : userNotis.filter(n => !isNotificationReadByUser(n, currentUser?.id)).length;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (compact) {
      setPopoverCoords({
        top: rect.bottom + 8,
        left: Math.max(12, rect.right - 380)
      });
    } else {
      // Default: position to the right of sidebar widget
      const idealLeft = rect.right + 12;
      const willOverflowRight = idealLeft + 384 > (window.innerWidth || 1200);
      setPopoverCoords({
        top: Math.max(12, Math.min(rect.top, (window.innerHeight || 800) - 450)),
        left: willOverflowRight ? Math.max(12, rect.left) : idealLeft
      });
    }
  }, [compact]);

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(prev => !prev);
  };

  const handleMarkAllAsRead = (e) => {
    e?.stopPropagation?.();
    if (propOnMarkAllAsRead) {
      propOnMarkAllAsRead();
    } else if (markAllNotificationsAsRead) {
      markAllNotificationsAsRead(currentUser?.id);
    }
  };

  const handleNotificationClick = (item) => {
    if (propOnNotificationClick) {
      propOnNotificationClick(item);
      return;
    }
    if (markNotificationAsRead && item.id) {
      markNotificationAsRead(item.id, currentUser?.id);
    }
    setIsOpen(false);
    const target = resolveNotificationNavigation(item, store);
    navigate(target.path, { state: target.state });
  };

  const handleViewAllNotifications = (e) => {
    e?.stopPropagation?.();
    setIsOpen(false);
    if (propOnViewAll) {
      propOnViewAll();
    } else {
      setIsHistoryModalOpen(true);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      const isInsideTrigger = triggerRef.current && triggerRef.current.contains(event.target);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
      if (!isInsideTrigger && !isInsideDropdown) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, updatePosition]);

  return (
    <>
      <div className={`relative ${className}`} ref={triggerRef}>
        {/* Trigger Button */}
        {triggerVariant === 'menu-row' ? (
          <button 
            type="button"
            onClick={handleToggle}
            aria-expanded={isOpen}
            aria-label="การแจ้งเตือน"
            className={`group relative w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl font-medium gap-2.5 transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 cursor-pointer ${
              isOpen
                ? 'bg-blue-50 text-blue-700 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {/* Subtle Active Indicator Bar when open */}
            {isOpen && (
              <span 
                aria-hidden="true"
                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-blue-600 transition-all" 
              />
            )}

            <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-0.5">
              <Bell 
                className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                  isOpen ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                }`} 
                strokeWidth={1.5} 
              />
              <span className="truncate leading-normal tracking-tight text-[13px]">การแจ้งเตือน</span>
            </div>

            {unreadCount > 0 ? (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full shrink-0 bg-rose-500 text-white shadow-2xs transition-transform group-hover:scale-105">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>
        ) : compact ? (
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isOpen}
            aria-label="การแจ้งเตือนระบบ"
            className={`relative p-2 rounded-full border transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 ${
              isOpen
                ? 'bg-slate-100 text-slate-900 border-slate-300'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 shadow-2xs'
            }`}
            title="การแจ้งเตือนระบบ"
          >
            <Bell size={16} strokeWidth={2} className="text-slate-700" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-blue-600 text-white text-[9.5px] font-mono font-bold flex items-center justify-center ring-2 ring-white animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        ) : (
          <button 
            type="button"
            onClick={handleToggle}
            aria-expanded={isOpen}
            aria-label="การแจ้งเตือนระบบ"
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/60 transition-all text-slate-700 cursor-pointer shadow-2xs group my-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 ${
              isOpen ? 'bg-slate-100 ring-2 ring-blue-500/20 border-slate-300' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative flex items-center justify-center">
                <Bell size={16} strokeWidth={2} className="text-blue-600 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110 shrink-0" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
                )}
              </div>
              <span className="truncate tracking-tight text-xs font-medium text-slate-800">
                การแจ้งเตือนระบบ
              </span>
            </div>
            {unreadCount > 0 ? (
              <span className="bg-rose-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full shadow-2xs">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : (
              <span className="bg-slate-200 text-slate-600 text-[11px] px-2 py-0.5 rounded-full font-medium">
                0
              </span>
            )}
          </button>
        )}

        {/* Floating Popover Dropdown rendered into document.body to bypass any overflow clipping */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div 
                ref={dropdownRef}
                initial={{ opacity: 0, scale: 0.96, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 6 }}
                transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
                style={{
                  position: 'fixed',
                  top: `${popoverCoords.top}px`,
                  left: `${popoverCoords.left}px`,
                  zIndex: 9999
                }}
                className="w-88 sm:w-96 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-2xl focus:outline-none divide-y divide-slate-200 overflow-hidden"
              >
                {/* 1. Header: Title + Unread Badge + Mark All As Read */}
                <div className="p-3.5 px-4 bg-slate-50 flex items-center justify-between border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Bell className="text-blue-600" size={16} strokeWidth={2} />
                    <h3 className="text-sm font-bold text-slate-900">การแจ้งเตือน</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {unreadCount} ใหม่
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-all cursor-pointer"
                    >
                      อ่านทั้งหมด
                    </button>
                  )}
                </div>

                {/* 2. Scrollable Notification Items Area */}
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar bg-white">
                  {userNotis.length === 0 ? (
                    <div className="py-10 px-4 text-center">
                      <BellOff className="text-slate-400 mx-auto mb-2" size={28} strokeWidth={1.5} />
                      <p className="text-xs font-medium text-slate-400">ไม่มีการแจ้งเตือนใหม่</p>
                    </div>
                  ) : (
                    userNotis.map((item) => {
                      const isUnread = !isNotificationReadByUser(item, currentUser?.id);
                      const timeDisplay = item.timestamp || item.created_at || item.createdAt
                        ? dayjs(item.timestamp || item.created_at || item.createdAt).fromNow() 
                        : (item.time || 'เมื่อสักครู่');

                      return (
                        <div
                          key={item.id || item.title + (item.timestamp || Math.random())}
                          onClick={() => handleNotificationClick(item)}
                          className={`p-3.5 px-4 flex items-start gap-3 hover:bg-slate-50 cursor-pointer transition-colors ${
                            isUnread ? 'bg-blue-50/40' : 'bg-white'
                          }`}
                        >
                          {/* Unread Indicator Dot */}
                          <div className="pt-1.5 shrink-0">
                            {isUnread ? (
                              <span className="block w-2 h-2 rounded-full bg-blue-600" />
                            ) : (
                              <span className="block w-2 h-2 rounded-full bg-transparent" />
                            )}
                          </div>

                          {/* Notification Content */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-xs truncate ${isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-600'}`}>
                                {item.title}
                              </p>
                              <span className="text-[10px] font-mono text-slate-400 shrink-0 whitespace-nowrap">
                                {timeDisplay}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed break-words">
                              {item.message || item.description}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 3. Footer */}
                <div className="p-2.5 bg-slate-50 text-center border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleViewAllNotifications}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    ดูประวัติการแจ้งเตือนทั้งหมด
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </div>

      {/* Notification Center Modal */}
      {isHistoryModalOpen && (
        <NotificationCenterModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
        />
      )}
    </>
  );
};

export default NotificationPopover;

