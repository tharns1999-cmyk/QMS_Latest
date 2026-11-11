import React from 'react';
import { History, Edit3, Archive, RotateCcw, Layers } from 'lucide-react';
import { canManageVccAsset } from '../utils/departmentScope';

export const AssetRegisterTable = ({
  assets = [],
  isMobile = false,
  currentUser,
  showDepartment = false,
  onOpenHistory,
  onEdit,
  onRetire,
  onReactivate
}) => {
  if (isMobile) {
    return (
      <div className="p-3 space-y-3" data-testid="vcc-asset-mobile-card-list">
        {assets.map((asset) => {
          const canManage = canManageVccAsset(currentUser, asset.department);
          const isComposite = asset.group_nature === 'COMPOSITE_SET' || (asset.components && asset.components.length > 0);
          const componentCount = asset.components ? asset.components.length : 0;
          const displayName = (asset.name || '').replace(/^\[ข้อมูลทดสอบ\]\s*/i, '');
          const deptLabel = asset.department === 'QC'
            ? 'QC (ควบคุมคุณภาพ)'
            : asset.department === 'LB'
              ? 'LB (ห้องปฏิบัติการ)'
              : asset.department === 'QA'
                ? 'QA (ประกันคุณภาพ)'
                : asset.department === 'WH'
                  ? 'WH (คลังสินค้า)'
                  : asset.department;

          return (
            <div
              key={asset.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono font-bold text-sm text-slate-900">{asset.asset_code}</div>
                  <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium mt-1">
                    {asset.asset_type || '-'}
                  </span>
                  {isComposite && (
                    <span className="block mt-1 text-[11px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                      ชุดเครื่องมือ (Composite Set){componentCount > 0 ? ` · ${componentCount} รายการ` : ''}
                    </span>
                  )}
                </div>
                <div>
                  {asset.status === 'ACTIVE' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>ใช้งานปกติ</span>
                    </span>
                  )}
                  {asset.status === 'ON_HOLD' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>ระงับใช้</span>
                    </span>
                  )}
                  {asset.status === 'UNDER_REPAIR' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 text-orange-800 border border-orange-200 text-xs font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      <span>ส่งซ่อม</span>
                    </span>
                  )}
                  {asset.status === 'RETIRED' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-semibold">
                      <span>ปลดออกแล้ว</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs space-y-1 text-slate-600">
                <div className="font-semibold text-slate-900 text-sm">{displayName}</div>
                <div><span className="text-slate-400">สถานที่:</span> {asset.location || '-'}</div>
                {asset.serial_no && (
                  <div className="font-mono text-xs"><span className="text-slate-400 font-sans">Serial:</span> {asset.serial_no}</div>
                )}
                {showDepartment && (
                  <div><span className="text-slate-400">แผนก:</span> {deptLabel}</div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  data-testid="btn-asset-history-mobile"
                  onClick={() => onOpenHistory(asset.id)}
                  className="min-h-[44px] sm:min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer select-none"
                >
                  <History size={13} />
                  <span>ประวัติ</span>
                </button>

                {canManage ? (
                  <>
                    {asset.status === 'ACTIVE' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(asset)}
                          className="min-h-[44px] sm:min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 cursor-pointer select-none"
                        >
                          <Edit3 size={13} />
                          <span>แก้ไข</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRetire(asset)}
                          className="min-h-[44px] sm:min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 cursor-pointer select-none"
                        >
                          <Archive size={13} />
                          <span>ปลดออกจากทะเบียน</span>
                        </button>
                      </>
                    )}
                    {asset.status === 'RETIRED' && (
                      <button
                        type="button"
                        onClick={() => onReactivate(asset)}
                        className="min-h-[44px] sm:min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 cursor-pointer select-none"
                      >
                        <RotateCcw size={13} />
                        <span>นำกลับมาใช้</span>
                      </button>
                    )}
                  </>
                ) : (
                  <span
                    data-testid="asset-responsible"
                    className="text-[11px] text-slate-500 font-medium"
                    title={`ผู้รับผิดชอบ: หัวหน้าแผนก ${asset.department} (L4 ขึ้นไป) หรือ DCC`}
                  >
                    ผู้รับผิดชอบ: หัวหน้าแผนก {asset.department} (L4 ขึ้นไป) หรือ DCC
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10.5px] tracking-wider select-none">
            <th className="py-2.5 px-3.5 w-72 sm:w-80">เครื่องมือ</th>
            <th className="py-2.5 px-3.5">แผนก / สถานที่</th>
            <th className="py-2.5 px-3.5 w-32 font-mono">Serial Number</th>
            <th className="py-2.5 px-3.5 w-28 text-center">สถานะ</th>
            <th className="py-2.5 px-3.5 text-right w-56 sm:w-64">การจัดการ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {assets.map((asset) => {
            const canManage = canManageVccAsset(currentUser, asset.department);
            const isComposite = asset.group_nature === 'COMPOSITE_SET' || (asset.components && asset.components.length > 0);
            const componentCount = asset.components ? asset.components.length : 0;
            const displayName = (asset.name || '').replace(/^\[ข้อมูลทดสอบ\]\s*/i, '');
            const deptLabel = asset.department === 'QC'
              ? 'QC (ควบคุมคุณภาพ)'
              : asset.department === 'LB'
                ? 'LB (ห้องปฏิบัติการ)'
                : asset.department === 'QA'
                  ? 'QA (ประกันคุณภาพ)'
                  : asset.department === 'WH'
                    ? 'WH (คลังสินค้า)'
                    : asset.department;

            return (
              <tr
                key={asset.id}
                className="hover:bg-slate-50/70 transition-colors group"
              >
                {/* Col 1: Code & Name */}
                <td className="py-2.5 px-3.5 align-middle">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-slate-900">
                      {asset.asset_code}
                    </span>
                    <span className="font-medium text-slate-800">
                      {displayName}
                    </span>
                    {isComposite && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Layers size={10} />
                        <span>ชุดเครื่องมือ (Composite Set){componentCount > 0 ? ` · ${componentCount} รายการ` : ''}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    <span>{asset.asset_type || '-'}</span>
                    {asset.model && <span className="mx-1">·</span>}
                    {asset.model && <span>{asset.model}</span>}
                  </div>
                </td>

                {/* Col 2: Location */}
                <td className="py-2.5 px-3.5 align-middle text-slate-600">
                  <span className="sr-only" data-testid="asset-ownership">
                    {canManage ? 'แผนกของฉัน • จัดการได้' : 'แผนกอื่น • ดูอย่างเดียว'}
                  </span>
                  <div>{asset.location || '-'}</div>
                  {showDepartment && (
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                      {deptLabel}
                    </div>
                  )}
                </td>

                {/* Col 3: Serial No */}
                <td className="py-2.5 px-3.5 align-middle font-mono text-slate-600">
                  {asset.serial_no || '-'}
                </td>

                {/* Col 4: Status */}
                <td className="py-2.5 px-3.5 align-middle text-center">
                  {asset.status === 'ACTIVE' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>ใช้งานปกติ</span>
                    </span>
                  )}
                  {asset.status === 'ON_HOLD' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>ระงับใช้</span>
                    </span>
                  )}
                  {asset.status === 'UNDER_REPAIR' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      <span>ส่งซ่อม</span>
                    </span>
                  )}
                  {asset.status === 'RETIRED' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-semibold">
                      <span>ปลดออกแล้ว</span>
                    </span>
                  )}
                </td>

                {/* Col 5: Actions */}
                <td className="py-2.5 px-3.5 align-middle text-right whitespace-nowrap">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenHistory(asset.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer shadow-2xs transition-colors"
                      title="ดูรายละเอียดและประวัติเครื่องมือ"
                    >
                      <History size={13} className="text-slate-500" />
                      <span>ประวัติ</span>
                    </button>

                    {canManage ? (
                      <>
                        {asset.status === 'ACTIVE' && (
                          <>
                            <button
                              type="button"
                              onClick={() => onEdit(asset)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 cursor-pointer transition-colors"
                            >
                              <Edit3 size={13} />
                              <span>แก้ไข</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onRetire(asset)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 cursor-pointer transition-colors"
                            >
                              <Archive size={13} />
                              <span>ปลดออกจากทะเบียน</span>
                            </button>
                          </>
                        )}
                        {asset.status === 'RETIRED' && (
                          <button
                            type="button"
                            onClick={() => onReactivate(asset)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 cursor-pointer transition-colors"
                          >
                            <RotateCcw size={13} />
                            <span>นำกลับมาใช้</span>
                          </button>
                        )}
                        {(asset.status === 'ON_HOLD' || asset.status === 'UNDER_REPAIR') && (
                          <span className="text-[11px] text-slate-500">
                            ปลดระงับที่หน้า “ใบสั่งงาน”
                          </span>
                        )}
                      </>
                    ) : (
                      <span
                        data-testid="asset-responsible"
                        className="text-[11px] text-slate-500 font-medium"
                        title={`ผู้รับผิดชอบ: หัวหน้าแผนก ${asset.department} (L4 ขึ้นไป) หรือ DCC`}
                      >
                        ผู้รับผิดชอบ: หัวหน้าแผนก {asset.department} (L4 ขึ้นไป) หรือ DCC
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AssetRegisterTable;
