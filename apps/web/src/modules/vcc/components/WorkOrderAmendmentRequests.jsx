import React, { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import useStore from '../../../store/useStore';
import {
  fetchVccWorkOrderAmendmentRequests,
  approveVccWorkOrderAmendment,
  rejectVccWorkOrderAmendment
} from '../api/vccWorkOrderApi';

// Pending amendment requests of a CLOSED work order. The server decides who may approve (level, separation of
// duties); this panel only hides the buttons from the requester and shows whatever the server refuses.
export const WorkOrderAmendmentRequests = ({ workOrderId, onResolved }) => {
  const currentUser = useStore((s) => s.currentUser);
  const [requests, setRequests] = useState([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRequests(await fetchVccWorkOrderAmendmentRequests(workOrderId));
    } catch {
      setRequests([]);
    }
  }, [workOrderId]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = requests.filter((r) => r.status === 'PENDING');
  if (pending.length === 0) return null;

  const act = async (kind, req) => {
    if (kind === 'reject' && !comment.trim()) {
      setError('กรุณาระบุเหตุผลที่ปฏิเสธ');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (kind === 'approve') await approveVccWorkOrderAmendment(workOrderId, req.id, { comment: comment.trim() });
      else await rejectVccWorkOrderAmendment(workOrderId, req.id, { comment: comment.trim() });
      setComment('');
      await load();
      onResolved?.();
    } catch (err) {
      setError(err.message || 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
      <div className="font-bold flex items-center gap-1.5 text-amber-900">
        <History size={14} className="text-amber-700" />
        <span>คำขอแก้ไขผลที่รออนุมัติ</span>
      </div>
      {pending.map((req) => {
        const isRequester = req.requested_by === currentUser?.id;
        return (
          <div key={req.id} className="bg-white/80 p-2 rounded-lg border border-amber-200/60 space-y-2">
            <div>ผู้ขอ: <span className="font-bold">{req.requester_name || req.requested_by}</span></div>
            <div>
              <span className="font-semibold block text-xs text-amber-900">เหตุผล:</span>
              <span>{req.amendment_reason}</span>
            </div>
            {isRequester ? (
              <p className="text-amber-800">คุณเป็นผู้ขอแก้ไข รอผู้อนุมัติท่านอื่นดำเนินการ</p>
            ) : (
              <>
                <textarea
                  aria-label="ความเห็นของผู้อนุมัติ"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="ความเห็น (จำเป็นเมื่อปฏิเสธ)"
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act('approve', req)}
                    className="h-8 px-3 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    อนุมัติคำขอแก้ไข
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act('reject', req)}
                    className="h-8 px-3 rounded-lg border border-rose-300 text-rose-700 font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    ปฏิเสธคำขอแก้ไข
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {error && <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">{error}</p>}
    </div>
  );
};
