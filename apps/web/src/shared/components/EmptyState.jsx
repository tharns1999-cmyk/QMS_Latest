import React from 'react';
import { PackageOpen } from 'lucide-react';

const EmptyState = ({ message = "ไม่พบรายการข้อมูลที่เกี่ยวข้อง", icon: Icon = PackageOpen }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="bg-slate-100/80 p-2.5 rounded-full text-slate-400 mb-2">
        <Icon className="w-10 h-10 text-slate-400" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-slate-700 mt-2">{message}</p>
      <p className="text-xs text-slate-400 mt-0.5">
        ยังไม่มีข้อมูลที่ต้องแสดงผลในขณะนี้
      </p>
    </div>
  );
};

export default EmptyState;
