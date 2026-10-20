import React from 'react';

/**
 * ฟังก์ชันรวบรวมประวัติทั้งวงจรชีวิตของเอกสาร (Full Document Lifecycle Traceability)
 * สำหรับเอกสารที่อยู่ในสถานะ OBSOLETE หรือต้องการประวัติแบบ Code-Wide
 * ดึงข้อมูลทั้งจากคำร้อง DARs ใน Store และ revision_history ในอ็อบเจกต์เอกสาร
 * 
 * @param {Object} currentDoc - อ็อบเจกต์เอกสาร
 * @param {Array} allDars - รายการคำร้อง DARs ทั้งหมดในระบบ
 * @returns {Array} รายการประวัติเรียงลำดับจากล่าสุดไปหาเก่าสุด (OBSOLETE -> Rev สูงสุด -> Rev.00)
 */
export const resolveFullDocumentHistory = (currentDoc, allDars = []) => {
  if (!currentDoc) return [];

  const docCode = currentDoc.code || currentDoc.document_code;

  // 1. ดึง DARs จริงจากระบบที่ตรงกับรหัสเอกสารนี้
  const realDars = allDars.filter(d => 
    (d.document_code === docCode || d.doc_code === docCode)
  );

  // 2. ดึงประวัติย้อนหลังที่ฝังอยู่ในตัวเอกสาร
  const embeddedHistory = (currentDoc.revision_history || []).map(item => ({
    ...item,
    isEmbedded: true
  }));

  // 3. รวมสองแหล่งเข้าด้วยกัน
  const rawPool = [...realDars, ...embeddedHistory];

  // 4. สร้าง Map คัดกรองแบบ Unique Key
  // Key format: "REVISION_01", "NEW_00", "OBSOLETE_02"
  const historyMap = new Map();

  rawPool.forEach(item => {
    const rev = String(item.target_revision ?? item.revision ?? '00').padStart(2, '0');
    const isObsolete = item.type === 'OBSOLETE' || item.action_type === 'OBSOLETE';
    const groupKey = isObsolete ? `OBSOLETE_${rev}` : `NORMAL_${rev}`;

    const existing = historyMap.get(groupKey);

    if (!existing) {
      historyMap.set(groupKey, item);
    } else {
      // Priority Rule: หากตัวหนึ่งเป็น Real DAR (มี dar_no จริง ไม่ใช่ DAR-REV-) ให้แทนที่ตัวจำลองทันที
      const isCurrentReal = item.dar_no && !item.dar_no.startsWith('DAR-REV-') && !item.dar_no.startsWith('HIST-');
      const isExistingSynthetic = existing.dar_no && (existing.dar_no.startsWith('DAR-REV-') || existing.dar_no.startsWith('HIST-'));

      if (isCurrentReal || isExistingSynthetic) {
        historyMap.set(groupKey, item);
      }
    }
  });

  // 5. แปลงกลับเป็น Array และจัดเรียงลำดับ
  const deduplicatedList = Array.from(historyMap.values());

  return deduplicatedList.sort((a, b) => {
    const isAObsolete = a.type === 'OBSOLETE' || a.action_type === 'OBSOLETE';
    const isBObsolete = b.type === 'OBSOLETE' || b.action_type === 'OBSOLETE';

    // OBSOLETE ต้องอยู่บนสุดเสมอ
    if (isAObsolete && !isBObsolete) return -1;
    if (!isAObsolete && isBObsolete) return 1;

    // นอกนั้นเรียงตาม Revision จากมากไปน้อย (ล่าสุดอยู่บน)
    const revA = Number.parseInt(a.target_revision ?? a.revision ?? 0, 10);
    const revB = Number.parseInt(b.target_revision ?? b.revision ?? 0, 10);
    return revB - revA;
  });
};

// เผื่อชื่อที่ระบุใน Prompt จะถูกเรียกใช้
export const resolveDeduplicatedDocumentHistory = resolveFullDocumentHistory;

export default function DocumentHistoryTab({ currentDoc, allDars, onDownload }) {
  const history = resolveDeduplicatedDocumentHistory(currentDoc, allDars);

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 inline-block">
        พบทั้งหมด {history.length} ฉบับ
      </div>
      <div className="space-y-2">
        {history.map((item, idx) => (
          <div key={item.id || idx} className="p-3 border rounded-lg flex items-center justify-between bg-white">
            <div>
              <span className="font-bold text-sm">
                {item.type === 'OBSOLETE' ? `สิ้นสุดที่ Rev.${item.revision}` : `Rev.${item.revision}`}
              </span>
              <span className="ml-2 text-slate-600 text-sm font-mono">{item.dar_no}</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-100">{item.type}</span>
            </div>
            {onDownload && (
              <button
                type="button"
                onClick={() => onDownload(item)}
                className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
              >
                ดาวน์โหลด
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
