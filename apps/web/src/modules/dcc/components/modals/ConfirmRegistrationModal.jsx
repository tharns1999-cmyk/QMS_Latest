import React from 'react';
import { MapPin, CheckCircle2 } from 'lucide-react';
import ActionConfirmModal from '../../../../shared/components/common/ActionConfirmModal';
import { cleanLocationName } from '../../services/MasterDataService';

/**
 * PointOfUseSection - Modern Structured Card/Chip per Enterprise QMS standard.
 * Prevents text overflow, tokenizes copy number, target department, and location.
 */
export const PointOfUseSection = ({
  distributionList = [],
  defaultCopyData,
  isFormDocument = false
}) => {
  if (isFormDocument) {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
        <span>แบบฟอร์มเปล่า (FM) ดิจิทัล - Bypass การออกเล่มสำเนาควบคุม</span>
      </div>
    );
  }

  const defaultData = defaultCopyData || {
    copyNo: 'Copy 01',
    locationName: 'QC Office',
    location: 'QC Office',
    department: 'QC',
    dept: 'QC',
    locationDetail: '(สำนักงานประกันและควบคุมคุณภาพ)'
  };

  const list = distributionList && distributionList.length > 0 ? distributionList : [defaultData];

  return (
    <div className="space-y-2">
      {list.map((item, idx) => {
        const copyNum = item.copyNo 
          ? (String(item.copyNo).startsWith('Copy') ? item.copyNo : `Copy ${item.copyNo}`)
          : `Copy ${String(idx + 1).padStart(2, '0')}`;
        const locName = cleanLocationName(item.locationName || item.location || item.station_name || item.name || 'QC Office');
        const deptTag = item.department || item.dept || item.departmentId || 'QC';
        const locDetail = item.locationDetail || item.fullLocationName || (item.dept_name ? `(${item.dept_name})` : '(สำนักงานประกันและควบคุมคุณภาพ)');

        return (
          <div 
            key={idx} 
            className="flex items-start gap-2.5 p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl hover:bg-slate-100/60 transition-colors min-w-0"
          >
            {/* Copy Badge */}
            <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
              {copyNum}
            </span>

            {/* Location & Dept Content */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-800 break-words line-clamp-2">
                  {locName}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shrink-0">
                  {deptTag}
                </span>
              </div>
              
              {/* Subtitle / รายละเอียดจุดติดตั้ง */}
              <div className="flex items-center gap-1 text-[11px] text-slate-500 min-w-0">
                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">
                  {locDetail}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * ConfirmRegistrationModal - Confirm New Document Registration Modal.
 * Encapsulates the registration confirmation specification dialog.
 */
const ConfirmRegistrationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = "ยืนยันการส่งคำร้องขอขึ้นทะเบียนเอกสารใหม่ (Confirm New Document Registration)",
  summaryData = [],
  distributionList = [],
  defaultCopyData,
  isFormDocument = false,
  isLoading = false,
  confirmText = "ยืนยันการส่งคำร้องขอ",
  cancelText = "ยกเลิก / กลับไปแก้ไข",
  ...rest
}) => {
  // If distributionList is supplied and not already in summaryData, inject it
  const formattedSummary = React.useMemo(() => {
    if (!summaryData || summaryData.length === 0) {
      return [
        {
          label: 'จุดใช้งานและแผนกแจกจ่าย',
          value: (
            <PointOfUseSection 
              distributionList={distributionList} 
              defaultCopyData={defaultCopyData} 
              isFormDocument={isFormDocument} 
            />
          )
        }
      ];
    }

    return summaryData.map((item) => {
      if (item.label && (item.label.includes('จุดใช้งาน') || item.label.includes('แจกจ่าย'))) {
        // If already a valid element, preserve it unless it's null/undefined
        if (item.value) return item;
        return {
          ...item,
          value: (
            <PointOfUseSection 
              distributionList={distributionList} 
              defaultCopyData={defaultCopyData} 
              isFormDocument={isFormDocument} 
            />
          )
        };
      }
      return item;
    });
  }, [summaryData, distributionList, defaultCopyData, isFormDocument]);

  return (
    <ActionConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      actionType="submit"
      summaryData={formattedSummary}
      isLoading={isLoading}
      confirmText={confirmText}
      cancelText={cancelText}
      {...rest}
    />
  );
};

export default ConfirmRegistrationModal;
