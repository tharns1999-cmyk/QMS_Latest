import React from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { moduleRegistry, MODULE_STATUS } from '../moduleRegistry';
import { usePortalTranslation } from '../locales/portalTranslations';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';

const PortalLandingPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useStore();
  const { t } = usePortalTranslation();

  const hasModuleAccess = () => {
    return true; 
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-4 space-y-8 w-full max-w-full overflow-hidden">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 rounded-xl text-white shadow-none relative overflow-hidden">
        <div className="relative z-10 space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-indigo-200 text-xs font-bold">
            <Sparkles size={13} className="text-[#0D99FF]" />
            <span>Enterprise Quality Management Platform</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            {t('hub', 'title')}
          </h1>
          <p className="text-sm md:text-base text-slate-300 leading-relaxed">
            {t('hub', 'subtitle')}
          </p>
        </div>

        {currentUser && (
          <div className="relative z-10 p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 space-y-1 self-start md:self-auto min-w-[200px]">
            <span className="text-xs text-indigo-200 uppercase font-bold tracking-wider block">ผู้ใช้งานปัจจุบัน</span>
            <div className="font-bold text-sm text-white truncate">{currentUser.name}</div>
            <div className="text-xs text-slate-300 font-medium">{currentUser.position || 'Staff'} • {currentUser.department}</div>
          </div>
        )}
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {moduleRegistry.sort((a, b) => a.order - b.order).map((module) => {
          const Icon = module.icon;
          const isActive = module.status === MODULE_STATUS.ACTIVE;
          const hasAccess = hasModuleAccess(module);
          
          return (
            <div 
              key={module.moduleId}
              className={`
                relative p-6 rounded-xl border transition-all duration-200 flex flex-col h-full
                ${isActive && hasAccess 
                  ? 'bg-white border-[#E5E5E5]/80 shadow-xs hover:shadow-sm hover:border-indigo-300 cursor-pointer group' 
                  : 'bg-[#F5F5F5]/70 border-[#E5E5E5]/60 opacity-60 cursor-not-allowed'}
              `}
              onClick={() => {
                if (isActive && hasAccess) {
                  navigate(module.route);
                }
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl transition-colors ${
                  isActive && hasAccess 
                    ? 'bg-[#E5F4FF] text-[#0D99FF] group-hover:bg-[#0D99FF] group-hover:text-white' 
                    : 'bg-[#F5F5F5] text-slate-400'
                }`}>
                  <Icon size={22} strokeWidth={1.75} />
                </div>
                
                {isActive ? (
                  hasAccess ? (
                    <span className="badge-active">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      {t('hub', 'open')}
                    </span>
                  ) : (
                    <span className="badge-rejected">
                      <Lock size={11} /> Locked
                    </span>
                  )
                ) : (
                  <span className="badge-draft">
                    {t('hub', 'comingSoon')}
                  </span>
                )}
              </div>
              
              <h3 className={`text-base font-bold mb-1.5 tracking-tight ${isActive && hasAccess ? 'text-[#1E1E1E] group-hover:text-[#0D99FF]' : 'text-slate-700'}`}>
                {module.name}
              </h3>
              
              <p className="text-xs text-[#666666] flex-grow mb-6 leading-relaxed">
                {module.description}
              </p>
              
              <div className="mt-auto pt-4 border-t border-slate-100">
                <button 
                  className={`
                    w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2
                    ${isActive && hasAccess 
                      ? 'bg-slate-900 text-white group-hover:bg-[#0D99FF] shadow-xs' 
                      : 'bg-[#F5F5F5] text-slate-400 cursor-not-allowed'}
                  `}
                  disabled={!isActive || !hasAccess}
                >
                  <span>{isActive ? (hasAccess ? `เข้าใช้งาน ${module.name.split(' ')[0]}` : 'Access Denied') : t('hub', 'comingSoon')}</span>
                  {isActive && hasAccess && <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PortalLandingPage;
