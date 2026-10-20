import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

const OPTIONS = [
  'GHPs / HACCP',
  'ISO 9001',
  'ISO 14001',
  'FSSC 22000',
  'BRCGS',
  'ปฏิบัติการทั่วไป (General Operations)',
  'อื่น ๆ (Others)'
];

const RelatedStandardsSelector = ({ value, onChange, error }) => {
  // value: { relatedStandards: string[], otherStandardDetail: string }

  const handleCheckboxChange = (option) => {
    let newStandards = [...(value?.relatedStandards || [])];
    
    if (newStandards.includes(option)) {
      newStandards = newStandards.filter(s => s !== option);
    } else {
      newStandards.push(option);
    }
    
    // If "Others" is unchecked, clear the detail text
    let newDetail = value?.otherStandardDetail || '';
    if (!newStandards.includes('อื่น ๆ (Others)')) {
      newDetail = '';
    }

    onChange({
      ...value,
      relatedStandards: newStandards,
      otherStandardDetail: newDetail
    });
  };

  const handleOtherDetailChange = (e) => {
    onChange({
      ...value,
      otherStandardDetail: e.target.value
    });
  };

  const isOthersSelected = (value?.relatedStandards || []).includes('อื่น ๆ (Others)');

  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-5 w-full">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-[#1E293B]">ระบบมาตรฐานที่เกี่ยวข้อง (Related Standards)</h3>
        <p className="text-xs text-[#64748B] mt-0.5">เลือกได้มากกว่า 1 ข้อ</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3.5 gap-x-6">
        {OPTIONS.map(option => (
          <label key={option} className="flex items-center gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={(value?.relatedStandards || []).includes(option)}
                onChange={() => handleCheckboxChange(option)}
              />
              <div className="w-4.5 h-4.5 border border-[#CBD5E1] rounded-md bg-white peer-checked:bg-[#0D99FF] peer-checked:border-[#0D99FF] transition-colors flex items-center justify-center group-hover:border-[#0D99FF]">
                <Check className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} />
              </div>
            </div>
            <span className="text-sm text-[#334155] font-medium select-none group-hover:text-[#0D99FF] transition-colors">{option}</span>
          </label>
        ))}
      </div>

      <AnimatePresence>
        {isOthersSelected && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <input
              type="text"
              placeholder="โปรดระบุมาตรฐานหรือข้อกำหนดอื่นๆ..."
              value={value?.otherStandardDetail || ''}
              onChange={handleOtherDetailChange}
              className={`w-full h-10.5 px-3.5 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D99FF]/15 focus:border-[#0D99FF] transition-all ${
                error ? 'border-rose-400 bg-rose-50/50' : 'border-[#CBD5E1]'
              }`}
            />
            {error && (
              <p className="text-rose-500 text-xs mt-1.5 font-medium">{error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RelatedStandardsSelector;
