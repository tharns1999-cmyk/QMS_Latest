import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { ErrorBoundary } from '../../shared/components/ErrorBoundary';
import { isApiMode } from '../../api/client';
import { AlertTriangle, Menu, X } from 'lucide-react';

const Layout = () => {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // The drawer closes after navigating, and on Escape
  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  // Redirect root to portal
  if (location.pathname === '/') {
    return <Navigate to="/portal" replace />;
  }

  const isViewer = location.pathname.includes('/viewer');
  const isTaskWorkspace = location.pathname.includes('/tasks/review') || location.pathname.includes('/tasks/approve');

  return (
    <div className="h-full w-full bg-slate-50 flex flex-col overflow-hidden font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {!isApiMode && (
        <aside
          role="status"
          aria-label="ระบบกำลังทำงานในโหมดข้อมูลจำลอง"
          data-testid="demo-mode-banner"
          className="bg-amber-500 text-slate-950 px-4 py-1 text-xs font-bold text-center flex items-center justify-center gap-2 shrink-0 select-none shadow-xs z-50"
        >
          <AlertTriangle size={14} className="text-slate-950 shrink-0 animate-pulse" />
          <span>โหมดข้อมูลจำลอง (DEMO MODE / LOCAL STORAGE) — ไม่ได้เชื่อมต่อ API จริง ข้อมูลจะถูกเก็บเฉพาะในเบราว์เซอร์เครื่องนี้</span>
        </aside>
      )}
      <div className="flex-1 flex overflow-hidden min-w-0 h-full">
        {navOpen && (
          <div
            data-testid="sidebar-backdrop"
            aria-hidden="true"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          />
        )}
        <Sidebar isOpen={navOpen} onClose={() => setNavOpen(false)} />
        
        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-50">
          <header className="lg:hidden shrink-0 flex items-center gap-3 h-12 px-3 bg-white border-b border-slate-200">
            <button
              type="button"
              onClick={() => setNavOpen((o) => !o)}
              aria-label={navOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
              aria-expanded={navOpen}
              aria-controls="app-sidebar"
              className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              {navOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="text-sm font-black text-slate-900 tracking-tight">QMS</span>
          </header>
          {/* Spacing & Scroll Container */}
          <main className={`flex-1 ${isTaskWorkspace ? 'overflow-hidden p-0' : isViewer ? 'overflow-y-auto overflow-x-hidden p-1.5 sm:p-2.5' : 'overflow-y-auto overflow-x-hidden p-6 md:p-8'} w-full max-w-full min-w-0 h-full scroll-smooth custom-scrollbar`}>
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
