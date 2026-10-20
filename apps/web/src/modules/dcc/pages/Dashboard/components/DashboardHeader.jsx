import React from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../../../../store/useStore';
import { 
  Library, Clock, ChevronRight, Plus, FileEdit, Activity 
} from 'lucide-react';

const DashboardHeader = ({
  simulatedDate,
  simulateNextDay
}) => {
  const navigate = useNavigate();
  const currentUser = useStore((state) => state.currentUser);

  const isAdmin = Boolean(
    currentUser?.isDcc || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.isDccAdmin
  );

  const isQmr = Boolean(
    currentUser?.isQmr || 
    currentUser?.role === 'QMR' || 
    (currentUser?.position && currentUser.position.toUpperCase().includes('QMR'))
  );

  return (
    <header className="bg-white border border-slate-200/80 rounded-xl px-4 py-2.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-h-[44px]">
      {/* Left: User greeting, department, and role info */}
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="font-semibold text-sm sm:text-[15px] text-slate-900 truncate">
          สวัสดีคุณ {currentUser?.name || 'ผู้ใช้งาน'}
        </span>
        <span className="text-slate-300 shrink-0">•</span>
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
          {currentUser?.department || 'PD'}
        </span>
        {isQmr ? (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
            GM/QMR
          </span>
        ) : currentUser?.isDcc ? (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
            DCC
          </span>
        ) : null}
        {currentUser?.position && (
          <span className="text-xs text-slate-500 truncate">
            ({currentUser.position})
          </span>
        )}
        {isAdmin && simulatedDate && (
          <span className="text-[11px] font-mono font-medium text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded hidden lg:inline shrink-0">
            SLA: {simulatedDate}
          </span>
        )}
      </div>

      {/* Right: Modern Compact Action Buttons (h-8 text-xs) */}
      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto flex-wrap">
        {isAdmin ? (
          <>
            <button
              onClick={() => navigate('/dcc/library')}
              className="h-8 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Library size={13} />
              <span>คลังเอกสารแม่บท</span>
            </button>
            {simulateNextDay && (
              <button
                onClick={simulateNextDay}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                title="จำลองวันเพื่อทดสอบระบบ SLA"
              >
                <Clock size={13} className="text-amber-600" />
                <span>จำลองข้ามวัน</span>
              </button>
            )}
            <button
              onClick={() => navigate('/controlled-copy?tab=ACTION_REQUIRED')}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>ประวัติแจกจ่าย</span>
              <ChevronRight size={13} className="text-slate-400" />
            </button>
          </>
        ) : currentUser?.level <= 3 ? (
          <>
            <button
              onClick={() => navigate('/dar/new')}
              className="h-8 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus size={13} />
              <span>สร้างเอกสารใหม่</span>
            </button>
            <button
              onClick={() => navigate('/dar/new/revision')}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileEdit size={13} className="text-sky-600" />
              <span>ขอแก้ไขเอกสาร</span>
            </button>
            <button
              onClick={() => navigate('/library')}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Library size={13} className="text-slate-400" />
              <span>คลังเอกสาร</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => navigate('/tasks')}
              className="h-8 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Activity size={13} />
              <span>ตรวจสอบคิวงาน</span>
            </button>
            <button
              onClick={() => navigate('/library')}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Library size={13} className="text-slate-400" />
              <span>คลังเอกสารแผนก</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default DashboardHeader;
