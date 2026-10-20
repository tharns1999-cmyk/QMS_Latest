import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Image as ImageIcon } from 'lucide-react';
import { getFile } from '../../utils/fileStorage';
import toast from 'react-hot-toast';

const FileViewerModal = ({ isOpen, onClose, attachedFile }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activeUrl = null;
    if (isOpen && attachedFile?.fileId) {
      setLoading(true);
      getFile(attachedFile.fileId)
        .then((fileOrBlob) => {
          if (fileOrBlob) {
            activeUrl = URL.createObjectURL(fileOrBlob);
            setBlobUrl(activeUrl);
          } else {
            toast.error('ไม่พบไฟล์ต้นฉบับในระบบ');
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          toast.error('เกิดข้อผิดพลาดในการโหลดไฟล์');
          setLoading(false);
        });
    }

    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [isOpen, attachedFile]);

  if (!isOpen || !attachedFile) return null;

  const isPdf = attachedFile.type === 'application/pdf';
  const isImage = attachedFile.type?.startsWith('image/');

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = attachedFile.name || 'document';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-6xl h-[88vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              {isPdf ? <FileText size={20} /> : <ImageIcon size={20} />}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">{attachedFile.name}</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {(attachedFile.size / 1024 / 1024).toFixed(2)} MB • {attachedFile.type}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!blobUrl}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download size={14} /> ดาวน์โหลดไฟล์จริง
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content - Edge-to-Edge */}
        <div className="flex-1 w-full bg-slate-900 relative flex flex-col items-center justify-center overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center text-slate-400">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
              <p className="text-sm font-semibold">กำลังโหลดไฟล์แนบ...</p>
            </div>
          ) : !blobUrl ? (
            <div className="flex flex-col items-center text-rose-500">
              <FileText size={48} className="opacity-50 mb-3" />
              <p className="text-sm font-bold">ไม่สามารถแสดงตัวอย่างไฟล์ได้</p>
            </div>
          ) : isPdf ? (
            <div className="absolute inset-0 w-full h-full overflow-hidden bg-slate-900">
              <iframe 
                src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} 
                className="w-full border-none block" 
                style={{
                  height: 'calc(100% + 52px)',
                  marginTop: '-52px'
                }}
                title="PDF Preview" 
              />
            </div>
          ) : isImage ? (
            <div className="w-full h-full overflow-auto flex items-center justify-center bg-slate-900">
              <img src={blobUrl} alt={attachedFile.name} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="flex flex-col items-center text-slate-500">
              <FileText size={48} className="opacity-50 mb-3" />
              <p className="text-sm font-bold">ไม่รองรับการพรีวิวไฟล์ประเภทนี้</p>
              <p className="text-xs mt-1">กรุณากดดาวน์โหลดเพื่อเปิดไฟล์</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileViewerModal;
