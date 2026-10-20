import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FilePlus, Edit, Trash2, ArrowRight, Sparkles } from 'lucide-react';

const DarSelection = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.darType === 'REVISION' || location.state?.targetDocCode || location.state?.selectedDocId) {
      const docCode = location.state.targetDocCode || location.state.docCode || '';
      const docId = location.state.selectedDocId || location.state.docId || '';
      const query = [];
      if (docCode) query.push(`docCode=${encodeURIComponent(docCode)}`);
      if (docId) query.push(`docId=${encodeURIComponent(docId)}`);
      const searchStr = query.length > 0 ? `?${query.join('&')}` : '';
      navigate(`/dar/new/revision${searchStr}`, {
        state: location.state,
        replace: true
      });
    } else if (location.state?.darType === 'OBSOLETE') {
      const docCode = location.state.targetDocCode || location.state.docCode || '';
      const docId = location.state.selectedDocId || location.state.docId || '';
      const query = [];
      if (docCode) query.push(`docCode=${encodeURIComponent(docCode)}`);
      if (docId) query.push(`docId=${encodeURIComponent(docId)}`);
      const searchStr = query.length > 0 ? `?${query.join('&')}` : '';
      navigate(`/dar/new/obsolete${searchStr}`, {
        state: location.state,
        replace: true
      });
    }
  }, [location.state, navigate]);

  const options = [
    {
      id: 'new',
      title: 'ขึ้นทะเบียนเอกสารใหม่',
      description: 'สร้างเอกสารฉบับใหม่ที่ไม่เคยมีในระบบมาก่อน ออกรหัสเอกสารตามโครงสร้างมาตรฐาน QMS',
      route: '/dar/new/document',
      icon: FilePlus,
      color: 'indigo',
      badge: 'Issue 01 / Rev. 00'
    },
    {
      id: 'revision',
      title: 'ขอแก้ไขเอกสาร',
      description: 'อัปเดตหรือปรับปรุงเนื้อหาเอกสารที่มีผลบังคับใช้ (EFFECTIVE) พร้อมรัน Revision Number อัตโนมัติ',
      route: '/dar/new/revision',
      icon: Edit,
      color: 'emerald',
      badge: 'Rev. Increment'
    },
    {
      id: 'obsolete',
      title: 'ขอยกเลิกเอกสาร',
      description: 'ขอยกเลิกการใช้งานเอกสารอย่างถาวรเมื่อเลิกใช้กระบวนการ พร้อมเข้าสู่กระบวนการเรียกคืนสำเนาควบคุม',
      route: '/dar/new/obsolete',
      icon: Trash2,
      color: 'rose',
      badge: 'Lifecycle End'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-2 w-full max-w-full overflow-hidden">
      <div className="card-surface p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
        <div className="flex items-center gap-2 text-[#0D99FF] text-xs font-bold uppercase tracking-wider mb-1">
          <Sparkles size={14} /> Document Action Request
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          สร้างคำร้องขอดำเนินการเอกสาร
        </h2>
        <p className="text-xs text-slate-300 mt-1 max-w-xl">
          กรุณาเลือกประเภทของคำร้องที่คุณต้องการดำเนินการ ระบบจะกำหนดสายการอนุมัติและการแจกจ่ายตามมาตรฐาน ISO 9001
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <div 
              key={opt.id}
              onClick={() => navigate(opt.route, { state: location.state })}
              className="card-surface-hover p-6 cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 bg-[#E5F4FF] text-[#0D99FF] rounded-xl flex items-center justify-center group-hover:bg-[#0D99FF] group-hover:text-white transition-colors duration-150 shadow-xs">
                    <Icon size={22} strokeWidth={1.75} />
                  </div>
                  <span className="badge-system">
                    {opt.badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-[#1E1E1E] group-hover:text-[#0D99FF] transition-colors tracking-tight">
                    {opt.title}
                  </h3>
                  <p className="text-xs text-[#666666] mt-1.5 leading-relaxed">
                    {opt.description}
                  </p>
                </div>
              </div>

              <div className="pt-5 mt-6 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0D99FF] group-hover:text-[#007BE5]">
                <span>เริ่มกรอกคำขอ</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform duration-150" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DarSelection;
