import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import useStore from '../../../store/useStore';

const UserSelector = ({ 
  value, 
  onChange, 
  error, 
  users = [],
  placeholder = "ค้นหาชื่อ หรือแผนก...",
  className = ""
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Safe Master Users Retrieval from useStore
  const storeMasterUsers = useStore((state) => state.masterUsers || state.users || []);
  const candidateUsers = (users && users.length > 0) ? users : storeMasterUsers;

  // Filter only active users (active !== false and status !== 'INACTIVE')
  const activeUsers = useMemo(() => {
    return (candidateUsers || []).filter(u => {
      if (!u) return false;
      if (u.active === false) return false;
      if (typeof u.status === 'string' && u.status.toUpperCase() === 'INACTIVE') return false;
      return true;
    });
  }, [candidateUsers]);

  // Find the selected user
  const selectedUser = (candidateUsers || []).find(u => u?.id === value || u?.empId === value);

  // Search & Filter Handling
  const filteredUsers = useMemo(() => {
    const sQuery = searchQuery?.trim().toLowerCase() ?? '';
    if (!sQuery) {
      // When searchTerm is empty, display all active users
      return activeUsers;
    }

    return activeUsers.filter(u => {
      const nameMatch = u?.name?.toLowerCase()?.includes(sQuery);
      const nameThMatch = (u?.nameTh || u?.fullName)?.toLowerCase()?.includes(sQuery);
      const nameEnMatch = u?.nameEn?.toLowerCase()?.includes(sQuery);
      const usernameMatch = u?.username?.toLowerCase()?.includes(sQuery);
      const idMatch = (u?.id || u?.empId)?.toLowerCase()?.includes(sQuery);
      const deptMatch = (u?.department || u?.dept)?.toLowerCase()?.includes(sQuery);
      return Boolean(nameMatch || nameThMatch || nameEnMatch || usernameMatch || idMatch || deptMatch);
    });
  }, [activeUsers, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelect = (user) => {
    onChange(user.id || user.empId);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setSearchQuery('');
  };

  return (
    <div className={`relative w-full z-30 ${isOpen ? '!z-50' : ''} ${className}`} ref={containerRef}>
      {value && selectedUser ? (
        <div className={`flex items-center justify-between rounded-xl px-3.5 py-2 bg-slate-100/80 border border-slate-200 min-h-[44px] ${error ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-50/50' : ''}`}>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
              {(selectedUser.fullName || selectedUser.name)?.charAt(0) || 'U'}
            </div>
            <div className="truncate flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-slate-800 text-sm truncate">
                  {selectedUser.fullName || selectedUser.name}
                </span>
                {selectedUser.nameEn && (
                  <span className="text-xs text-slate-400 font-medium truncate">({selectedUser.nameEn})</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {selectedUser.position || selectedUser.role || ''}
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-slate-200 text-slate-700 border border-slate-300/60 shrink-0">
              {selectedUser.department || selectedUser.dept || '-'}
            </span>
          </div>
          <button 
            type="button" 
            onClick={handleClear}
            className="text-slate-400 hover:text-rose-600 transition-colors p-1 rounded-lg ml-1"
            title="ลบการเลือก"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className={`w-full pl-10 pr-4 py-2.5 h-11 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all ${error ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-50/50' : ''}`}
          />
        </div>
      )}

      {isOpen && !value && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-2xl border border-slate-200/90 max-h-60 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
          {filteredUsers.length > 0 ? (
            <ul className="py-1 divide-y divide-slate-100">
              {filteredUsers.map(u => {
                const displayName = u?.fullName || u?.name || u?.nameTh || 'Unknown';
                const displayEn = u?.nameEn || (u?.username && u?.username !== u?.id ? u?.username : '');
                const dept = u?.department || u?.dept || '-';
                const position = u?.position || u?.roleTitle || u?.role || 'พนักงาน';

                return (
                  <li 
                    key={u?.id || u?.empId || Math.random()}
                    onClick={() => handleSelect(u)}
                    className="px-4 py-2.5 hover:bg-indigo-50/80 cursor-pointer flex items-center justify-between gap-3 transition-colors text-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {displayName.charAt(0) || 'U'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 text-sm truncate">{displayName}</span>
                          {displayEn && (
                            <span className="text-xs text-slate-400 font-medium truncate">({displayEn})</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {position}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                      {dept}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-4 text-xs text-slate-400 text-center flex flex-col items-center gap-1.5">
              <Search size={18} className="text-slate-300" />
              <span>ไม่พบผู้ใช้งานที่ตรงกับคำค้นหา</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserSelector;
