import React, { useState, useRef, useEffect, useMemo } from 'react';
import useStore from '../../../../store/useStore';
import { Send, UserCircle, MessageSquare, AlertTriangle } from 'lucide-react';

const DARComments = ({ darId, requesterId, dar }) => {
  const { timeline, currentUser, addDarComment, addComment, dars } = useStore();
  const [newComment, setNewComment] = useState('');
  const messagesEndRef = useRef(null);

  const targetDarId = String(darId || dar?.id || '').trim();
  const targetDarNo = String(dar?.darNo || dar?.dar_no || dar?.darNumber || '').trim();

  // Find dynamic DAR object if needed
  const dynamicDar = useMemo(() => {
    return (dars || []).find(d => 
      (targetDarId && (d.id === targetDarId || d.darNo === targetDarId || d.darNumber === targetDarId)) ||
      (targetDarNo && (d.id === targetDarNo || d.darNo === targetDarNo || d.darNumber === targetDarNo))
    ) || dar;
  }, [dars, dar, targetDarId, targetDarNo]);

  // Combine comments from dynamicDar.comments and timeline
  const commentsAndEvents = useMemo(() => {
    const list = [];
    const seenIds = new Set();

    // 1. From dar.comments array (persisted structured comments)
    if (dynamicDar && Array.isArray(dynamicDar.comments)) {
      dynamicDar.comments.forEach(c => {
        if (!c) return;
        const cId = c.id || `C-${c.createdAt}-${c.text}`;
        seenIds.add(cId);
        list.push({
          id: cId,
          isDarComment: true,
          action: 'Comment',
          user: c.author?.name || c.author?.fullName || 'ผู้ใช้งาน',
          userId: c.author?.id || c.author?.empId || '',
          userDept: c.author?.department || c.author?.dept || '',
          userPosition: c.author?.position || '',
          comment: c.text,
          date: c.date || (c.createdAt ? new Date(c.createdAt).toLocaleDateString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'),
          rawTime: c.createdAt ? new Date(c.createdAt).getTime() : 0,
          isChat: true
        });
      });
    }

    // 2. From timeline (chats and system events)
    (timeline || []).forEach(t => {
      if (!t) return;
      const tDarId = String(t.darId || '').trim();
      const tDarNo = String(t.darNo || '').trim();
      const matchesDar = (targetDarId && (tDarId === targetDarId || tDarNo === targetDarId)) ||
                         (targetDarNo && (tDarId === targetDarNo || tDarNo === targetDarNo));
      if (!matchesDar) return;

      // Avoid duplicating comment if already added via dar.comments (check commentId or id match)
      if (t.commentId && seenIds.has(t.commentId)) return;
      if (t.isChat && list.some(item => item.comment === t.comment && Math.abs((Number(item.rawTime) || 0) - (Number(t.id) || 0)) < 60000)) return;

      const isChatOrComment = t.isChat || t.action === 'Comment';
      const isSystemAction = ['RETURN', 'REJECT', 'APPROVE'].includes(t.action);

      if (isChatOrComment || isSystemAction) {
        list.push({
          id: t.id || `T-${Math.random()}`,
          isDarComment: false,
          action: t.action,
          user: t.user,
          userId: t.userId,
          comment: t.comment,
          date: t.date,
          rawTime: Number(t.id) || 0,
          isChat: t.isChat
        });
      }
    });

    return list.sort((a, b) => (Number(a.rawTime) || 0) - (Number(b.rawTime) || 0));
  }, [dynamicDar, timeline, targetDarId, targetDarNo]);

  const commentsCount = commentsAndEvents.filter(c => c.isChat || c.action === 'Comment').length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [commentsAndEvents.length]);

  const handleSend = (e) => {
    if (e?.preventDefault) e.preventDefault();
    const text = newComment.trim();
    if (!text || !targetDarId) return;

    if (addDarComment) {
      addDarComment(targetDarId, {
        id: `COMMENT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        text: text,
        author: {
          id: currentUser?.id || currentUser?.empId || 'U-CURRENT',
          name: currentUser?.name || currentUser?.fullName || 'ผู้ใช้งาน',
          position: currentUser?.position || '',
          department: currentUser?.department || currentUser?.dept || '',
          avatar: currentUser?.avatar || null
        },
        createdAt: new Date().toISOString()
      });
    } else if (addComment) {
      addComment(targetDarId, text, currentUser);
    }
    setNewComment('');
  };

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 flex flex-col h-[480px] overflow-hidden">
      {/* Header Bar with Dynamic Badge Counter */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} strokeWidth={1.5} className="text-slate-500" />
          <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
            ความคิดเห็น (Comments)
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            {commentsCount}
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {targetDarNo || targetDarId || 'DAR-THREAD'}
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
        {commentsAndEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-slate-400 text-center p-6 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-white text-slate-400 flex items-center justify-center shadow-2xs border border-slate-200">
              <MessageSquare size={18} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">ยังไม่มีความคิดเห็น</p>
              <p className="text-[11px] text-slate-400 mt-0.5 max-w-[220px] leading-relaxed">
                พิมพ์ข้อความสอบถามหรือบันทึกข้อเสนอแนะเกี่ยวกับคำร้องนี้ได้ที่ช่องด้านล่าง
              </p>
            </div>
          </div>
        ) : (
          commentsAndEvents.map((item, idx) => {
            const isSystemAction = ['RETURN', 'REJECT', 'APPROVE'].includes(item.action);
            const isRequester = item.userId === requesterId || item.user === currentUser?.name;
            const alignRight = !isSystemAction && isRequester;

            return (
              <div key={item.id || idx} className={`flex flex-col ${alignRight ? 'items-end' : 'items-start'}`}>
                {isSystemAction ? (
                  <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl px-3.5 py-2 w-full max-w-sm mb-1 mx-auto text-center shadow-2xs">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-amber-800 font-semibold mb-0.5">
                      <AlertTriangle size={12} strokeWidth={1.5} className="text-amber-600" />
                      <span>บันทึกสถานะระบบ: {item.action}</span>
                    </div>
                    <p className="text-xs text-amber-950 leading-relaxed break-words">{item.comment}</p>
                    <p className="text-[10px] font-mono text-amber-700 mt-1">โดย {item.user} • {item.date}</p>
                  </div>
                ) : (
                  <div className={`flex gap-2 max-w-[88%] ${alignRight ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 mt-0.5">
                      <UserCircle size={17} strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <div className={`flex items-baseline gap-2 mb-0.5 ${alignRight ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-xs font-semibold text-slate-800 truncate">{item.user}</span>
                        {item.userDept && (
                          <span className="text-[10px] text-slate-400 font-medium">({item.userDept})</span>
                        )}
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">{item.date}</span>
                      </div>
                      <div className={`px-3.5 py-2 rounded-2xl text-xs shadow-2xs leading-relaxed break-words [overflow-wrap:anywhere] ${
                        alignRight 
                          ? 'bg-slate-900 text-white rounded-tr-xs' 
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                      }`}>
                        {item.comment}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Field with Smooth Enter Key Support */}
      <div className="p-2.5 bg-white border-t border-slate-100 shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-2 relative">
          <input 
            type="text" 
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="พิมพ์ความคิดเห็น หรือกด Enter เพื่อส่ง..." 
            className="flex-1 bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2 pr-10 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1.5 focus:ring-slate-400 focus:border-slate-400 transition-all"
          />
          <button 
            type="submit"
            disabled={!newComment.trim()}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-lg disabled:opacity-30 disabled:hover:bg-slate-900 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
            title="ส่งข้อความ (Enter)"
          >
            <Send size={14} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default DARComments;
