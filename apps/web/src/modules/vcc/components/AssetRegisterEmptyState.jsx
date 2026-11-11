import React from 'react';
import { Wrench, Plus } from 'lucide-react';
import { getAssetStatusLabel } from '../utils/statusLabels';

export const AssetRegisterEmptyState = ({
  scopedDepartment,
  activeTab = 'ALL',
  canAddAsset = false,
  isDepartmentEmpty = false,
  onAdd
}) => {
  if (isDepartmentEmpty && scopedDepartment) {
    return (
      <div className="p-12 text-center space-y-3" data-testid="clean-department-empty-state">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto border border-slate-200/80">
          <Wrench size={22} />
        </div>
        <div className="text-slate-800 font-bold text-base">
          ยังไม่มีเครื่องมือวัดในทะเบียนของฝ่าย {scopedDepartment.nameTh} ({scopedDepartment.code})
        </div>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          {canAddAsset
            ? 'เริ่มต้นสร้างทะเบียนเครื่องมือวัดของแผนกคุณ เพื่อใช้ในการวางแผนทวนสอบและสอบเทียบประจำปี'
            : 'ยังไม่มีเครื่องมือวัดที่ลงทะเบียนไว้สำหรับแผนกนี้'}
        </p>
        {canAddAsset && (
          <div className="pt-1">
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-bold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus size={16} />
              <span>+ ลงทะเบียนเครื่องมือชิ้นแรก</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-12 text-center space-y-2">
      <div className="text-slate-700 font-bold text-base">
        {activeTab !== 'ALL'
          ? `ไม่พบรายการเครื่องมือในสถานะ ${getAssetStatusLabel(activeTab)}`
          : 'ไม่พบข้อมูลเครื่องมือวัดตามเงื่อนไขการค้นหา'}
      </div>
      <p className="text-slate-400 text-xs">
        ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองสถานะ/ประเภทเครื่องมือ
      </p>
    </div>
  );
};

export default AssetRegisterEmptyState;
