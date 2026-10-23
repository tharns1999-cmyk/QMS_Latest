import React from 'react';
import { formatDarNumber } from '../../utils/darNumberGenerator';

/**
 * ฟังก์ชันรวบรวมประวัติทั้งวงจรชีวิตของเอกสาร (Full Document Lifecycle Traceability)
 * สำหรับเอกสารที่อยู่ในสถานะ OBSOLETE หรือต้องการประวัติแบบ Code-Wide
 * ดึงข้อมูลทั้งจากคำร้อง DARs ใน Store และ revision_history ในอ็อบเจกต์เอกสาร
 * 
 * @param {Object} currentDoc - อ็อบเจกต์เอกสาร
 * @param {Array} allDars - รายการคำร้อง DARs ทั้งหมดในระบบ
 * @returns {Array} รายการประวัติเรียงลำดับจากล่าสุดไปหาเก่าสุด (OBSOLETE -> Rev สูงสุด -> Rev.00)
 */
export const resolveFullDocumentHistory = (currentDoc, allDars = [], matchedDars = null) => {
  if (!currentDoc) return [];

  const docCode = currentDoc.code || currentDoc.document_code;

  // 1. DARs จริงของรหัสเอกสารนี้ (ผู้เรียกที่จับคู่เองแล้วส่งมาได้) แสดงครบทุกใบ แม้ Rev เดียวกัน
  const realDars = matchedDars || allDars.filter(d =>
    (d.document_code === docCode || d.doc_code === docCode)
  );

  // 2. ประวัติย้อนหลังที่ฝังอยู่ในตัวเอกสาร ใช้เติมเฉพาะ Rev ที่ไม่มี DAR จริงรองรับ
  const revOf = (item) => String(item.target_revision ?? item.revision ?? '00').padStart(2, '0');
  const kindOf = (item) => (item.type === 'OBSOLETE' || item.action_type === 'OBSOLETE' ? 'OBSOLETE' : 'NORMAL');
  const covered = new Set(realDars.map(d => `${kindOf(d)}_${revOf(d)}`));
  const embeddedHistory = (currentDoc.revision_history || [])
    .filter(item => !covered.has(`${kindOf(item)}_${revOf(item)}`))
    .map(item => ({ ...item, isEmbedded: true }));

  // 3. ฝังกันซ้ำกันเอง (หนึ่งรายการต่อ Rev/ชนิด) แต่ DAR จริงไม่ถูกรวม
  const seenEmbedded = new Set();
  const uniqueEmbedded = embeddedHistory.filter(item => {
    const key = `${kindOf(item)}_${revOf(item)}`;
    if (seenEmbedded.has(key)) return false;
    seenEmbedded.add(key);
    return true;
  });

  return [...realDars, ...uniqueEmbedded].sort((a, b) => {
    const isAObsolete = kindOf(a) === 'OBSOLETE';
    const isBObsolete = kindOf(b) === 'OBSOLETE';

    // OBSOLETE ต้องอยู่บนสุดเสมอ
    if (isAObsolete && !isBObsolete) return -1;
    if (!isAObsolete && isBObsolete) return 1;

    // นอกนั้นเรียงตาม Revision จากมากไปน้อย (ล่าสุดอยู่บน)
    return Number.parseInt(revOf(b), 10) - Number.parseInt(revOf(a), 10);
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
              <span className="ml-2 text-slate-600 text-sm font-mono">{formatDarNumber(item.dar_no)}</span>
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
