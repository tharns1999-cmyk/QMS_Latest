import useStore from '../../../../store/useStore';

const formatLocalDate = (d) => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function SystemTimeSimulatorWidget({ className = '' }) {
  const {
    simulatedSystemDate,
    setSimulatedDate,
    fastForwardSystemDate,
    resetSimulatedDate
  } = useStore();

  const isSimulated = Boolean(simulatedSystemDate);
  const currentDateValue = simulatedSystemDate || formatLocalDate(new Date());

  const handleDateChange = (e) => {
    const val = e.target.value;
    if (!val) {
      resetSimulatedDate();
    } else {
      setSimulatedDate(val);
    }
  };

  return (
    <div className={`p-2.5 bg-white border border-slate-200/90 rounded-xl shadow-2xs space-y-2 text-xs ${className}`}>
      {/* Header & Status Badge */}
      <div className="flex items-center justify-between text-slate-700">
        <span className="flex items-center gap-1.5 font-medium text-slate-800 tracking-tight">
          <span className="text-sm">⏱️</span>
          <span>เวลาจำลองระบบ</span>
        </span>
        {isSimulated ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-800 border border-amber-200/80 font-medium font-mono">
            จำลองอยู่
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200 font-medium font-mono">
            เวลาจริง
          </span>
        )}
      </div>

      {/* Date Picker Input */}
      <div>
        <input
          type="date"
          value={currentDateValue}
          onChange={handleDateChange}
          aria-label="วันที่จำลองระบบ"
          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer outline-none"
        />
      </div>

      {/* Quick Action Buttons (4 Buttons) */}
      <div className="grid grid-cols-4 gap-1 pt-0.5">
        <button
          type="button"
          onClick={() => fastForwardSystemDate(6)}
          title="เพิ่มเวลาไปข้างหน้า 6 เดือน"
          className="py-1 px-1 bg-slate-50 hover:bg-slate-100 active:scale-95 border border-slate-200 rounded-md text-[10px] text-slate-700 text-center font-medium transition-all cursor-pointer truncate"
        >
          +6 เดือน
        </button>
        <button
          type="button"
          onClick={() => fastForwardSystemDate(12)}
          title="เพิ่มเวลาไปข้างหน้า 1 ปี (12 เดือน)"
          className="py-1 px-1 bg-indigo-50/70 hover:bg-indigo-100/80 active:scale-95 border border-indigo-200/80 rounded-md text-[10px] text-indigo-700 text-center font-semibold transition-all cursor-pointer truncate"
        >
          +1 ปี
        </button>
        <button
          type="button"
          onClick={() => fastForwardSystemDate(24)}
          title="เพิ่มเวลาไปข้างหน้า 2 ปี (24 เดือน)"
          className="py-1 px-1 bg-slate-50 hover:bg-slate-100 active:scale-95 border border-slate-200 rounded-md text-[10px] text-slate-700 text-center font-medium transition-all cursor-pointer truncate"
        >
          +2 ปี
        </button>
        <button
          type="button"
          onClick={resetSimulatedDate}
          disabled={!isSimulated}
          title="รีเซ็ตเวลากลับสู่วันที่จริงของเครื่อง"
          className={`py-1 px-1 rounded-md text-[10px] text-center font-medium transition-all cursor-pointer truncate active:scale-95 border ${
            isSimulated
              ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200 shadow-2xs'
              : 'bg-slate-50 text-slate-400 border-slate-200/60 opacity-60 cursor-not-allowed'
          }`}
        >
          🔄 คืนค่า
        </button>
      </div>
    </div>
  );
}

export { SystemTimeSimulatorWidget };

