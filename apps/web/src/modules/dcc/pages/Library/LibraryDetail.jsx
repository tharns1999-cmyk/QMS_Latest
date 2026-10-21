import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { ChevronLeft, ExternalLink, History, FileText, Download, PlusCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getDarReason, getDarDetail, getRequesterName, getReviewerName, getApproverName, getAckNames } from '../../utils/darHelper';
import ReplacementModal from './ReplacementModal';
import { UniversalWatermarkService, WATERMARK_TYPES } from '../../services/UniversalWatermarkService';
import RequestAdditionalCopiesModal from '../../components/workflow/RequestAdditionalCopiesModal';
import Button from '../../../../shared/components/ui/Button';

const LibraryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents, currentUser, canDownloadDocument, dars, masterUsers, timeline, controlledCopyInstances, reportCcDamagedLost } = useStore();
  
  const [selectedDar, setSelectedDar] = useState(null);
  const [replacementInstance, setReplacementInstance] = useState(null);
  const [isRequestCopiesOpen, setIsRequestCopiesOpen] = useState(false);

  const doc = documents.find(d => d.id === id);

  const ccInstances = React.useMemo(() => {
    return doc ? controlledCopyInstances.filter(inst => inst.docId === doc.id) : [];
  }, [controlledCopyInstances, doc]);

  const userActiveInstances = React.useMemo(() => {
    const dept = currentUser.department || currentUser.dept;
    return ccInstances.filter(inst => inst.department === dept && inst.status === 'ACTIVE');
  }, [ccInstances, currentUser]);

  const hasAccess = React.useMemo(() => {
    if (!doc || !currentUser) return false;
    if (currentUser.level >= 5 || currentUser.isDcc || currentUser.role === 'DCC_ADMIN') return true;

    const userDept = currentUser.department || currentUser.dept;
    const userDepts = currentUser.depts || (userDept ? [userDept] : []);
    const docDept = doc.owner_dept || doc.department;

    const isMatch = (targetDept) => {
      if (!targetDept) return false;
      return userDepts.some(u => u === targetDept || (u === 'QA' && targetDept === 'QA/QC') || (u === 'QA/QC' && targetDept === 'QA'));
    };

    if (isMatch(docDept)) return true;
    if (doc.target_depts && doc.target_depts.some(d => isMatch(d))) return true;
    if (doc.distributions && doc.distributions.some(d => isMatch(d.departmentId || d.dept))) return true;

    return false;
  }, [doc, currentUser]);

  const canDownload = React.useMemo(() => {
    if (!doc || !currentUser) return false;
    return canDownloadDocument(doc, currentUser);
  }, [doc, currentUser, canDownloadDocument]);

  const canRequestAdditionalCopies = React.useMemo(() => {
    if (!doc || !currentUser) return false;
    const isEffective = doc.status === 'EFFECTIVE' || doc.status === 'ACTIVE';
    if (!isEffective) return false;

    const userDept = currentUser.department || currentUser.dept;
    const userDepts = currentUser.depts || (userDept ? [userDept] : []);
    const docDept = doc.owner_dept || doc.department;

    const isOwnerDept = docDept && (docDept === userDept || userDepts.includes(docDept));
    const isDcc = currentUser.isDcc || currentUser.role === 'DCC_ADMIN' || currentUser.level >= 5;

    return isOwnerDept || isDcc;
  }, [doc, currentUser]);

  React.useEffect(() => {
    if (doc && !hasAccess) {
      toast.error('Access Denied: คุณไม่มีสิทธิ์เข้าถึงเอกสารนี้');
      navigate('/library');
    }
  }, [doc, hasAccess, navigate]);

  if (!doc) return <div className="p-6 text-[#666666] font-medium">ไม่พบข้อมูลเอกสาร</div>;
  if (!hasAccess) return null;

  // Real attached file through the single watermark engine (clean master is DCC-only and audited there)
  const handleDownloadMaster = async () => {
    try {
      await UniversalWatermarkService.downloadCleanPdf(doc, { docCode: doc.title, userName: currentUser.name, userDept: currentUser.department });
      toast.success('ดาวน์โหลด Master Document สำเร็จ');
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'เกิดข้อผิดพลาดในการสร้าง PDF');
    }
  };

  const handleDownloadExternal = async () => {
    try {
      await UniversalWatermarkService.downloadWatermarkedPdf(doc, WATERMARK_TYPES.UNCONTROLLED_COPY, {
        docCode: doc.title,
        docTitle: doc.name,
        docVersion: doc.rev,
        userName: currentUser.name,
        userDept: currentUser.department,
        authorizedScope: 'External Auditor / Vendor Release'
      });
      toast.success('ดาวน์โหลดเอกสารสำหรับหน่วยงานภายนอกสำเร็จ');
    } catch (error) {
      console.error(error);
      toast.error('เกิดข้อผิดพลาดในการสร้าง PDF');
    }
  };

  const handleDownloadUncontrolled = async () => {
    try {
      const isForm = UniversalWatermarkService.isBlankFormBypass(doc);
      if (isForm) {
        await UniversalWatermarkService.downloadCleanPdf(doc, {
          userName: currentUser.name,
          userDept: currentUser.department || currentUser.dept || 'PD',
          docCode: doc.title
        });
        toast.success(`ดาวน์โหลดแบบฟอร์ม ${doc.title} (ไม่มีลายน้ำ) สำเร็จ`);
        return;
      }

      await UniversalWatermarkService.downloadWatermarkedPdf(
        doc,
        WATERMARK_TYPES.UNCONTROLLED_COPY,
        {
          docCode: doc.title,
          docTitle: doc.name,
          docVersion: doc.rev,
          userName: currentUser.name,
          userDept: currentUser.department || currentUser.dept || 'PD',
          isRestricted: doc.access_control?.scope === 'RESTRICTED' || doc.accessScope === 'Restricted' || doc.accessScope === 'RESTRICTED'
        }
      );

      toast.success('ดาวน์โหลดเอกสาร (Uncontrolled Copy) สำเร็จ');
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการสร้าง PDF');
    }
  };

  // Get all revisions of this document
  const allRevs = documents.filter(d => d.title === doc.title).sort((a, b) => parseInt(b.rev, 10) - parseInt(a.rev, 10));
  
  // Get latest DAR for the current document
  const latestDar = doc.darId 
    ? dars.find(dar => dar.id === doc.darId)
    : dars.slice().reverse().find(dar => {
        if (!['COMPLETED', 'APPROVED_WAITING_EFFECTIVE', 'WAITING_EFFECTIVE', 'EFFECTIVE'].includes(dar.status)) return false;
        if (doc.rev === '00' && (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT')) {
           return dar.docIdInput === doc.title;
        } else if (doc.rev !== '00' && dar.type === 'REVISION') {
           return dar.title === doc.name || (dar.docIdRef && documents.find(d => d.id === dar.docIdRef)?.title === doc.title);
        }
        return false;
      });

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 w-full max-w-full overflow-hidden">

      <div className="flex items-center gap-3 min-w-0">
        <button onClick={() => navigate('/library')} className="action-icon-btn text-slate-600 hover:text-[#0D99FF] print:hidden shrink-0">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-[#0D99FF] text-lg">{doc.title}</span>
            <span className="badge-active font-mono">Rev. {doc.rev}</span>
          </div>
          <h2 className="text-xl font-bold text-[#1E1E1E] tracking-tight break-all break-words min-w-0 [overflow-wrap:anywhere]">{doc.name}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-w-0">
        <div className="lg:col-span-7 space-y-6 min-w-0">
          <div className="card-surface p-6 min-w-0">
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2.5 mb-4">ข้อมูลเอกสาร (Document Details)</h3>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 text-xs min-w-0">
              <div className="min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">รหัสเอกสาร:</span> <span className="font-mono font-bold text-[#007BE5] break-all break-words min-w-0 [overflow-wrap:anywhere]">{doc.title}</span></div>
              <div className="min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">Revision:</span> <span className="font-mono font-bold text-[#1E1E1E]">Rev. {doc.rev}</span></div>
              <div className="min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">แผนกเจ้าของ:</span> <span className="font-bold text-slate-800 font-mono break-all break-words min-w-0 [overflow-wrap:anywhere]">{doc.department}</span></div>
              <div className="min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">สถานะ:</span> <span className={`${doc.status === 'OBSOLETE' || doc.status === 'OBSOLETE_ARCHIVED' ? 'badge-rejected' : 'badge-active'}`}>{doc.status === 'SUPERSEDED_ARCHIVED' ? 'SUPERSEDED' : doc.status}</span></div>
              
              <div className="col-span-2 border-t border-slate-100 pt-3.5 mt-1"></div>
              
              <div className="min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">ประเภทการขอ:</span> <span className="font-bold text-slate-800">{latestDar?.type === 'NEW' || latestDar?.type === 'NEW_DOCUMENT' ? 'ขึ้นทะเบียนใหม่ (New)' : latestDar?.type === 'REVISION' ? 'ขอแก้ไข (Revision)' : latestDar?.type === 'OBSOLETE' ? 'ขอยกเลิก (Obsolete)' : '-'}</span></div>
              <div className="min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">วันที่มีผลบังคับใช้:</span> <span className="font-mono text-slate-800">{doc.effectiveDate || latestDar?.effectiveDate || '-'}</span></div>
              <div className="min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">ผู้ร้องขอ:</span> <span className="font-medium text-slate-800 break-all break-words min-w-0 [overflow-wrap:anywhere]">{getRequesterName(latestDar, masterUsers)}</span></div>
              <div className="min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">ผู้ทบทวน:</span> <span className="font-medium text-slate-800 break-all break-words min-w-0 [overflow-wrap:anywhere]">{getReviewerName(latestDar, timeline)}</span></div>
              <div className="min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">ผู้อนุมัติ:</span> <span className="font-medium text-slate-800 break-all break-words min-w-0 [overflow-wrap:anywhere]">{getApproverName(latestDar, timeline)}</span></div>
              <div className="col-span-2 min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">การแจกจ่าย:</span> <span className="font-medium text-slate-800 break-all break-words min-w-0 [overflow-wrap:anywhere]">{doc.distributions && doc.distributions.length > 0 ? doc.distributions.map(d => d.locationName ? `${d.departmentId} (${d.copyNo ? `Copy ${d.copyNo}: ` : ''}${d.locationName})` : d.departmentId).join(', ') : '-'}</span></div>
              
              {(latestDar?.ackRequirement === 'REQUIRED' || getAckNames(latestDar, timeline) !== '-') && (
                 <div className="col-span-2 min-w-0"><span className="text-slate-400 w-32 inline-block shrink-0">ผู้รับทราบ (Ack):</span> <span className="font-medium text-slate-800 break-all break-words min-w-0 [overflow-wrap:anywhere]">{getAckNames(latestDar, timeline)}</span></div>
              )}
              
              <div className="col-span-2 mt-1 pt-3.5 border-t border-slate-100 min-w-0">
                <span className="text-slate-400 block mb-1 font-bold">{getDarReason(latestDar).title}</span> 
                <p className="font-medium text-slate-800 bg-[#F5F5F5] p-3 rounded-xl border border-slate-100 break-all break-words min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{getDarReason(latestDar).value}</p>
              </div>

              <div className="col-span-2 mt-1 min-w-0">
                <span className="text-slate-400 block mb-1 font-bold">{getDarDetail(latestDar).title}</span> 
                <p className="font-medium text-slate-800 bg-[#F5F5F5] p-3 rounded-xl border border-slate-100 break-all break-words min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{getDarDetail(latestDar).value}</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2.5 mt-5 print:hidden">
              <Button 
                variant="primary"
                onClick={() => navigate(`/viewer/${doc.id}/${doc.rev}`)}
                className="flex-1 text-xs"
              >
                <ExternalLink size={15} /> เปิดดูเอกสาร PDF
              </Button>

              {canRequestAdditionalCopies && (
                <Button 
                  variant="secondary"
                  onClick={() => setIsRequestCopiesOpen(true)}
                  className="flex-1 text-xs"
                >
                  <PlusCircle size={15} /> ขอแจกจ่ายสำเนาเพิ่ม
                </Button>
              )}
            </div>

            {canDownload && (
              <div className="flex flex-col gap-2.5 mt-4 pt-4 border-t border-slate-100">
                {currentUser.isDcc ? (
                  <>
                    <button 
                      onClick={handleDownloadMaster}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0D99FF] text-white hover:bg-[#007BE5] rounded-xl text-xs font-bold shadow-sm shadow-indigo-200 transition-all"
                    >
                      <Download size={16} /> {doc.title.startsWith('FM') ? 'พิมพ์ / ดาวน์โหลดแบบฟอร์ม (Form Master)' : 'ดาวน์โหลด Master File (DCC Master Copy)'}
                    </button>
                    <button 
                      onClick={handleDownloadExternal}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white hover:bg-amber-700 rounded-xl text-xs font-bold shadow-sm shadow-amber-200 transition-all"
                    >
                      <Download size={16} /> ดาวน์โหลดสำหรับหน่วยงานภายนอก (Uncontrolled Copy)
                    </button>
                    <button 
                      onClick={handleDownloadUncontrolled}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white hover:bg-slate-900 rounded-xl text-xs font-bold shadow-sm transition-all"
                    >
                      <Download size={16} /> ดาวน์โหลดสำเนาไม่ควบคุม (Uncontrolled Copy)
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={handleDownloadUncontrolled}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0D99FF] text-white hover:bg-[#007BE5] rounded-xl text-xs font-bold shadow-sm shadow-indigo-200 transition-all"
                  >
                    <Download size={16} /> {doc.title.startsWith('FM') ? 'พิมพ์ / ดาวน์โหลดแบบฟอร์มเปล่า (Clean Form)' : 'ดาวน์โหลดเอกสาร (Uncontrolled Copy)'}
                  </button>
                )}

              </div>
            )}
          </div>

          {/* Normal User: Show their active copy and allow requesting replacement */}
          {!currentUser.isDcc && userActiveInstances.length > 0 && (
            <div className="card-surface p-6 border-[#E5F4FF] bg-[#E5F4FF]/20">
              <h3 className="font-bold text-xs text-indigo-900 uppercase tracking-wider mb-3">สำเนาควบคุมของแผนกท่าน (Your Department's Controlled Copy)</h3>
              <div className="space-y-3">
                {userActiveInstances.map(inst => (
                  <div key={inst.id} className="bg-white p-3.5 rounded-xl border border-[#E5F4FF] flex items-center justify-between shadow-xs">
                    <div>
                      <div className="font-mono font-bold text-sm text-[#1E1E1E]">{inst.ccNumber}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">Issue: {inst.issueNumber} • จุดใช้งาน: {inst.locationName || inst.department}</div>
                    </div>
                    <button 
                      onClick={() => setReplacementInstance(inst)}
                      className="text-xs px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg font-bold border border-rose-200 transition-colors"
                    >
                      แจ้งชำรุด/สูญหาย
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controlled Copies Tracker (Only for DCC Admin) */}
          {currentUser.isDcc && (
            <div className="card-surface p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-4">
                <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">สำเนาควบคุมในระบบ (Controlled Copies Tracker)</h3>
              </div>
              <div className="table-wrapper">
                <table className="w-full text-xs text-left">
                  <thead className="table-header">
                    <tr>
                      <th className="px-3.5 py-2.5">CC Number</th>
                      <th className="px-3.5 py-2.5">Department</th>
                      <th className="px-3.5 py-2.5 text-center">Issue No.</th>
                      <th className="px-3.5 py-2.5 text-center">Status</th>
                      <th className="px-3.5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ccInstances.map((inst) => (
                      <tr key={inst.id} className="table-row">
                        <td className="px-3.5 py-2.5 font-mono font-bold text-[#0D99FF]">{inst.ccNumber}</td>
                        <td className="px-3.5 py-2.5 text-slate-700 font-bold">{inst.department}</td>
                        <td className="px-3.5 py-2.5 text-center text-slate-600 font-mono">{inst.issueNumber}</td>
                        <td className="px-3.5 py-2.5 text-center">
                          <span className="badge-active">
                            {inst.status}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <button 
                            onClick={() => setReplacementInstance(inst)}
                            className="text-xs px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg font-medium border border-rose-200 transition-colors"
                          >
                            แจ้งชำรุด/สูญหาย
                          </button>
                        </td>
                      </tr>
                    ))}
                    {ccInstances.length === 0 && (
                      <tr>
                        <td colSpan="5" className="px-4 py-8 text-center text-slate-400 text-xs">
                          ไม่มีการพิมพ์สำเนาควบคุมสำหรับเอกสารนี้
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Revision History */}
        <div className="lg:col-span-5">
          <div className="card-surface overflow-hidden">
            <div className="px-6 py-3.5 border-b border-slate-100 bg-[#F5F5F5]/80 flex items-center gap-2">
              <History className="text-[#0D99FF]" size={16} />
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">ประวัติ Revision (Revision History)</h3>
            </div>
            <div className="p-6">
              <div className="space-y-5 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-200">
                {allRevs.map((revDoc, index) => {
                  const isCurrent = index === 0;
                  const revDar = dars.slice().reverse().find(dar => 
                    ['COMPLETED', 'APPROVED_WAITING_EFFECTIVE', 'WAITING_EFFECTIVE', 'EFFECTIVE'].includes(dar.status) && 
                    ((dar.type === 'NEW' && dar.docIdInput === revDoc.title) || (dar.type === 'REVISION' && dar.docIdRef === revDoc.title))
                  );

                  return (
                    <div key={revDoc.id} className="relative flex items-start gap-3.5">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 border-white ${isCurrent ? 'bg-[#0D99FF] text-white shadow-xs' : 'bg-[#F5F5F5] text-slate-400'} shrink-0 z-10`}>
                        <FileText size={15} />
                      </div>
                      <div className={`w-full ${isCurrent ? 'bg-[#E5F4FF]/50 border-[#E5F4FF]/80 shadow-xs' : 'bg-[#F5F5F5] border-[#E5E5E5]'} p-3.5 rounded-xl border`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`font-bold text-xs font-mono ${isCurrent ? 'text-[#007BE5]' : 'text-slate-700'}`}>
                            Rev. {revDoc.rev} {isCurrent ? '(Current)' : '(Archived)'}
                          </span>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-xs text-slate-400 font-mono">Effective: {revDoc.effectiveDate || '-'}</span>
                            {!isCurrent && (
                              <span className="text-xs text-rose-500 font-mono">Archived: {revDar?.date || 'Unknown'}</span>
                            )}
                          </div>
                        </div>
                        <p className={`text-xs ${isCurrent ? 'text-slate-600' : 'text-[#666666]'}`}>
                          {isCurrent ? 'เอกสารฉบับปัจจุบัน' : 'เอกสารฉบับเก่า (ยกเลิกแล้ว)'}
                        </p>
                        
                        {!isCurrent && (
                          <div className="mt-2.5 flex items-center gap-2">
                            <button 
                              onClick={() => navigate(`/viewer/${revDoc.id}/${revDoc.rev}?archive=true`)}
                              className="text-xs text-[#0D99FF] hover:text-[#007BE5] flex items-center gap-1 font-bold px-2 py-1 bg-white border border-[#E5F4FF] rounded-lg shadow-xs"
                            >
                              <ExternalLink size={12}/> เปิดดูฉบับเก่า (PDF)
                            </button>
                            {revDar && (
                              <button 
                                onClick={() => setSelectedDar(revDar)}
                                className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1 font-bold px-2 py-1 bg-white border border-purple-200 rounded-lg shadow-xs"
                              >
                                <History size={12}/> ดูใบคำขอ (DAR)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DAR Details Modal */}
      {selectedDar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-white shrink-0">
              <h3 className="font-bold text-slate-900 text-base">รายละเอียดใบคำขอ (Historical DAR: {selectedDar.id})</h3>
              <button 
                onClick={() => setSelectedDar(null)} 
                className="action-icon-btn text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 p-1.5 transition-colors"
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1 custom-scrollbar">
              <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                <div><span className="text-slate-400 block text-xs">รหัสคำขอ:</span> <span className="font-mono font-bold text-[#0D99FF]">{selectedDar.id}</span></div>
                <div><span className="text-slate-400 block text-xs">ประเภทคำขอ:</span> <span className="font-bold text-slate-800">{selectedDar.type}</span></div>
                <div><span className="text-slate-400 block text-xs">วันที่ร้องขอ:</span> <span className="font-mono text-slate-800">{selectedDar.date}</span></div>
                <div><span className="text-slate-400 block text-xs">วันที่มีผล:</span> <span className="font-mono text-slate-800">{selectedDar.effectiveDate || '-'}</span></div>
                
                <div className="col-span-2 border-t border-slate-100 pt-2.5"></div>

                <div><span className="text-slate-400 block text-xs">ผู้ร้องขอ:</span> <span className="font-medium text-slate-800">{getRequesterName(selectedDar, masterUsers)}</span></div>
                <div><span className="text-slate-400 block text-xs">แผนก:</span> <span className="font-medium text-slate-800 font-mono">{selectedDar.department}</span></div>
                <div><span className="text-slate-400 block text-xs">ผู้ทบทวน:</span> <span className="font-medium text-slate-800">{getReviewerName(selectedDar, timeline)}</span></div>
                <div><span className="text-slate-400 block text-xs">ผู้อนุมัติ:</span> <span className="font-medium text-slate-800">{getApproverName(selectedDar, timeline)}</span></div>
                
                <div className="col-span-2"><span className="text-slate-400 block text-xs">การแจกจ่าย:</span> <span className="font-medium text-slate-800">{selectedDar.distributionMode === 'ALL' ? 'ทุกแผนก (All Departments)' : (selectedDar.distributedDepts?.join(', ') || '-')}</span></div>
                {(selectedDar.ackRequirement === 'REQUIRED' || getAckNames(selectedDar, timeline) !== '-') && (
                  <div className="col-span-2"><span className="text-slate-400 block text-xs">ผู้รับทราบ (Ack):</span> <span className="font-medium text-slate-800">{getAckNames(selectedDar, timeline)}</span></div>
                )}
                
                <div className="col-span-2"><span className="text-slate-400 block text-xs">สถานะ:</span> <span className={`font-bold ${selectedDar.status === 'CANCELLED' ? 'text-rose-600' : 'text-[#0D99FF]'}`}>{selectedDar.status}</span></div>
              </div>
              <div className="border-t border-slate-100 pt-3 min-w-0">
                <span className="text-slate-600 block text-xs mb-1 font-bold">{getDarReason(selectedDar).title}</span>
                <p className="font-medium text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed min-w-0 break-words break-all [overflow-wrap:anywhere]">{getDarReason(selectedDar).value}</p>
              </div>
              <div className="min-w-0">
                <span className="text-slate-600 block text-xs mb-1 font-bold">{getDarDetail(selectedDar).title}</span>
                <p className="font-medium text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed min-w-0 break-words break-all [overflow-wrap:anywhere]">{getDarDetail(selectedDar).value}</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
              <Button 
                variant="secondary"
                onClick={() => setSelectedDar(null)}
                className="text-xs"
              >
                ปิดหน้าต่าง
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Replacement Modal */}
      <ReplacementModal 
        isOpen={!!replacementInstance} 
        onClose={async (success, type, reason) => {
          if (success && type && reason) {
            try {
              if ((await reportCcDamagedLost(replacementInstance.id, type, reason)) === false) return;
              toast.success('ยื่นคำร้องขอสำเนาทดแทนเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่ DCC จัดพิมพ์และส่งมอบ');
              setReplacementInstance(null);
            } catch (err) {
              console.error('[LibraryDetail] reportCcDamagedLost failed:', err);
              toast.error(err?.message || 'เกิดข้อผิดพลาดในการทำรายการ');
              throw err;
            }
          } else {
            setReplacementInstance(null);
          }
        }} 
        instance={replacementInstance}
        documentId={doc.id}
      />


      {/* Request Additional Copies Modal */}
      {isRequestCopiesOpen && (
        <RequestAdditionalCopiesModal
          isOpen={isRequestCopiesOpen}
          onClose={() => setIsRequestCopiesOpen(false)}
          document={doc}
        />
      )}
    </div>
  );
};

export default LibraryDetail;
