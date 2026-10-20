import React from 'react';
import { Bell, CheckCircle2, Clock, Mail } from 'lucide-react';

/**
 * @typedef {Object} DistributionRecord
 * @property {string} id
 * @property {string} department
 * @property {string} copyNo
 * @property {string} sentDate
 * @property {'Pending' | 'Acknowledged'} status
 * @property {string|null} ackDate
 */

/**
 * @typedef {Object} DistributionTrackerProps
 * @property {string} docNo
 * @property {string} title
 * @property {DistributionRecord[]} records
 * @property {(recordId: string) => void} onRemind
 */

/**
 * DistributionTracker component for DCC to monitor acknowledgments.
 * Minimalist data table with custom badges.
 *
 * @param {DistributionTrackerProps} props
 */
const DistributionTracker = ({ docNo, title, records, onRemind }) => {
  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden w-full">
      <div className="p-6 border-b border-slate-100 bg-[#FAFAFA]">
        <h3 className="text-lg font-bold text-slate-800 tracking-tight">Distribution Tracker</h3>
        <p className="text-sm text-[#666666] mt-1">
          Monitor acknowledgment status for <span className="font-medium text-slate-700">{docNo}</span> - {title}
        </p>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[480px] scrollbar-thin">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0] shadow-xs backdrop-blur-sm whitespace-nowrap">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-[#666666] uppercase tracking-wider bg-[#F8FAFC]">Department</th>
              <th className="px-6 py-4 text-xs font-bold text-[#666666] uppercase tracking-wider bg-[#F8FAFC]">Copy No.</th>
              <th className="px-6 py-4 text-xs font-bold text-[#666666] uppercase tracking-wider bg-[#F8FAFC]">Sent Date</th>
              <th className="px-6 py-4 text-xs font-bold text-[#666666] uppercase tracking-wider bg-[#F8FAFC]">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-[#666666] uppercase tracking-wider bg-[#F8FAFC]">Ack. Date</th>
              <th className="px-6 py-4 text-xs font-bold text-[#666666] uppercase tracking-wider bg-[#F8FAFC] text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {records.map((record) => (
              <tr key={record.id} className="hover:bg-[#F5F5F5]/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-medium text-slate-800">{record.department}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-slate-600 font-medium">{record.copyNo}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-[#666666] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {record.sentDate}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {record.status === 'Pending' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 text-xs font-bold">
                      <Clock className="w-3.5 h-3.5" />
                      Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Acknowledged
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-[#666666]">
                    {record.ackDate || '-'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {record.status === 'Pending' ? (
                    <button
                      onClick={() => onRemind(record.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-[#1E1E1E] hover:bg-[#F5F5F5] font-medium text-sm transition-colors"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      Remind
                    </button>
                  ) : (
                    <span className="text-slate-300 text-sm px-3 py-1.5">Done</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {records.length === 0 && (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <Mail className="w-8 h-8 text-slate-300 mb-3" />
            <p className="text-[#666666] font-medium">No distribution records found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DistributionTracker;
