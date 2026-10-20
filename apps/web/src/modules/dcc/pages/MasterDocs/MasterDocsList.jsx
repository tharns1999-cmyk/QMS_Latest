import React, { useState, useMemo } from 'react';
import useStore from '../../../../store/useStore';
import { isMyDepartment } from '../../services/darService';
import { 
  FileText, 
  Building2, 
  CheckCircle2, 
  FolderCheck, 
  Search, 
  Layers
} from 'lucide-react';
import { getDeptBadgeStyle } from '../../../../shared/utils/departmentColors';

export { isMyDepartment };

export const MasterDocsList = () => {
  const { documents = [], masterDocuments = [], currentUser } = useStore();
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' (มีผลบังคับใช้) | 'MY_DEPT' (ในแผนกฉัน) | 'ALL'
  const [searchQuery, setSearchQuery] = useState('');

  // Combine documents and masterDocuments with deduplication
  const allMasterDocs = useMemo(() => {
    const combined = [...(masterDocuments || []), ...(documents || [])];
    const map = new Map();
    combined.forEach(doc => {
      const code = doc.docNo || doc.code || doc.document_code || doc.docCode || doc.title;
      const rev = doc.revision || doc.rev || '00';
      const key = `${code}_${rev}`;
      if (!map.has(key)) {
        map.set(key, doc);
      }
    });
    return Array.from(map.values());
  }, [documents, masterDocuments]);

  // Tab counts
  const counts = useMemo(() => {
    const activeDocs = allMasterDocs.filter(d => 
      (d.status === 'ACTIVE' || d.status === 'EFFECTIVE' || d.is_active) && 
      !d.is_superseded && 
      !d.is_obsolete
    );
    const myDeptDocs = activeDocs.filter(d => 
      isMyDepartment(d.department || d.owner_dept || d.dept_code || d.docNo || d.code, currentUser)
    );
    return {
      active: activeDocs.length,
      myDept: myDeptDocs.length,
      all: allMasterDocs.length
    };
  }, [allMasterDocs, currentUser]);

  // Filtered list based on active tab and search
  const filteredDocs = useMemo(() => {
    return allMasterDocs.filter(doc => {
      const isDocActive = (doc.status === 'ACTIVE' || doc.status === 'EFFECTIVE' || doc.is_active) && !doc.is_superseded && !doc.is_obsolete;
      
      if (activeTab === 'ACTIVE' && !isDocActive) return false;
      if (activeTab === 'MY_DEPT') {
        if (!isDocActive) return false;
        if (!isMyDepartment(doc.department || doc.owner_dept || doc.dept_code || doc.docNo || doc.code, currentUser)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (doc.docNo || doc.code || doc.document_code || '').toLowerCase();
        const title = (doc.title || doc.name || '').toLowerCase();
        const dept = (doc.department || doc.departmentName || '').toLowerCase();
        return code.includes(q) || title.includes(q) || dept.includes(q);
      }

      return true;
    });
  }, [allMasterDocs, activeTab, searchQuery, currentUser]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FolderCheck className="text-blue-600" size={26} />
            คลังเอกสารแม่บท (Master Document Library)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            ศูนย์กลางจัดเก็บและเผยแพร่เอกสารควบคุมคุณภาพ มาตรฐาน ISO 9001
          </p>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab('ACTIVE')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'ACTIVE'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span>มีผลบังคับใช้ (Active)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
              {counts.active}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MY_DEPT')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'MY_DEPT'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 size={14} className="text-blue-600" />
            <span>ในแผนกฉัน</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
              {counts.myDept}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers size={14} className="text-slate-500" />
            <span>ทั้งหมด</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
              {counts.all}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหารหัส / ชื่อเอกสาร..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all"
          />
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4">รหัสเอกสาร (Doc No)</th>
              <th className="py-3 px-4">ชื่อเอกสาร (Title)</th>
              <th className="py-3 px-3 text-center">ประเภท</th>
              <th className="py-3 px-3 text-center">ฉบับ (Rev)</th>
              <th className="py-3 px-4">แผนกเจ้าของ (Dept)</th>
              <th className="py-3 px-3 text-center">วันบังคับใช้</th>
              <th className="py-3 px-3 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="font-medium">ไม่พบเอกสารในหมวดหมู่นี้</p>
                </td>
              </tr>
            ) : (
              filteredDocs.map((doc) => {
                const docCode = doc.docNo || doc.code || doc.document_code || doc.docCode || doc.title;
                const docTitle = doc.title || doc.name || docCode;
                const docRev = doc.revision || doc.rev || doc.edition || '00';
                const docDept = doc.department || doc.owner_dept || '-';

                return (
                  <tr key={doc.id || docCode} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-blue-600">
                      {docCode}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {docTitle}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {doc.type || doc.docType || 'SOP'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-semibold">
                      Rev.{docRev}
                    </td>
                    <td className="py-3 px-4">
                      {(() => {
                        const style = getDeptBadgeStyle(docDept);
                        const deptName = doc.departmentName || (docDept === 'QC' ? 'ฝ่ายประกันและควบคุมคุณภาพ' : '');
                        return (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${style.badge}`}>
                              <Building2 className={`w-3 h-3 shrink-0 ${style.icon}`} />
                              <span>{docDept}</span>
                            </span>
                            {deptName && (
                              <span className="text-xs text-slate-600 font-medium">
                                {deptName}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-600">
                      {doc.effectiveDate || doc.effective_date || '-'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/90">
                        <CheckCircle2 size={12} className="text-emerald-600" />
                        Active
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MasterDocsList;
