import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useStore from '../../store/useStore';
import { ShieldCheck } from 'lucide-react';
import NotificationPopover from './NotificationPopover';

const ROUTE_METADATA = {
  '/portal': { title: 'พอร์ทัลกลาง', subtitle: 'Portal Hub' },
  '/dcc/dashboard': { title: 'แดชบอร์ดภาพรวม', subtitle: 'Overview & Metrics' },
  '/dcc/dar/new': { title: 'สร้างคำร้อง DAR', subtitle: 'New Document Action Request' },
  '/dcc/dar/list': { title: 'คำร้อง DAR ของฉัน', subtitle: 'My Requests' },
  '/dcc/tasks': { title: 'กล่องงานที่ต้องทำ', subtitle: 'Actionable Task Inbox' },
  '/dcc/library': { title: 'คลังเอกสารแม่บท', subtitle: 'Master Document Library' },
  '/dcc/controlled-copy': { title: 'ทะเบียนสำเนาควบคุม', subtitle: 'Controlled Copies' },
  '/dcc/external-docs': { title: 'คลังเอกสารภายนอก', subtitle: 'External Documents' },
  '/dcc/periodic-reviews': { title: 'การทบทวนตามรอบ', subtitle: 'Periodic Document Reviews' },
  '/dcc/admin/master-data': { title: 'จัดการข้อมูลหลัก', subtitle: 'Master Data Hub' },
  '/dcc/admin/action-log': { title: 'ประวัติการทำงาน', subtitle: 'System Audit Trail' }
};

const Topbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useStore();

  const currentRoute = ROUTE_METADATA[location.pathname] || {
    title: 'ระบบควบคุมเอกสารคุณภาพ',
    subtitle: 'QMS Enterprise Portal'
  };

  return (
    <header className="h-14 px-6 md:px-8 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between z-20 shrink-0 select-none">
      {/* Left: Breadcrumbs / Route Context */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight truncate">
            {currentRoute.title}
          </h2>
        </div>
        <span className="text-slate-300 text-xs hidden sm:inline">•</span>
        <span className="text-[11px] text-slate-500 font-medium tracking-tight hidden sm:inline truncate">
          {currentRoute.subtitle}
        </span>
      </div>

      {/* Right: Quick Actions & User Profile Chip */}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        {/* ISO Standard Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[10.5px] font-mono font-medium text-slate-600">
          <ShieldCheck size={12} className="text-emerald-600" />
          <span>ISO 9001:2015</span>
        </div>

        {/* System Notifications Popover */}
        <NotificationPopover compact />

        {/* User Profile Chip */}
        {currentUser && (
          <div 
            onClick={() => navigate('/portal')}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all duration-150 cursor-pointer group"
            title="ผู้ใช้งานปัจจุบัน (คลิกเพื่อกลับสู่หน้าหลัก)"
          >
            <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-[11px] border border-blue-200 shrink-0 group-hover:scale-105 transition-transform">
              {currentUser.name?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0 max-w-[130px] sm:max-w-[180px]">
              <div className="text-xs font-semibold text-slate-900 truncate leading-tight">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-slate-500 font-medium font-mono truncate leading-none mt-0.5">
                {currentUser.department || 'QA'} • {currentUser.position || 'Staff'}
              </div>
            </div>
            {currentUser.isDcc && (
              <span className="ml-0.5 px-1.5 py-0.2 text-[8.5px] font-bold font-mono bg-blue-50 text-blue-700 rounded border border-blue-200 uppercase">
                DCC
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Topbar;
