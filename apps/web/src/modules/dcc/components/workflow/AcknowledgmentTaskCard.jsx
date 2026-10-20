import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, CheckCircle2, Lock, ArrowRight } from 'lucide-react';

/**
 * @typedef {Object} TaskData
 * @property {string} id
 * @property {string} docNo
 * @property {string} title
 * @property {string} rev
 * @property {string} copyNo
 */

/**
 * @typedef {Object} AcknowledgmentTaskCardProps
 * @property {TaskData} task
 * @property {(taskId: string, pin: string) => void} onAcknowledge
 * @property {(docNo: string, rev: string) => void} onViewPdf
 */

/**
 * AcknowledgmentTaskCard component for Digital Handshake.
 * Features Framer Motion expansion for PIN entry.
 *
 * @param {AcknowledgmentTaskCardProps} props
 */
const AcknowledgmentTaskCard = ({ task, onAcknowledge, onViewPdf }) => {
  const [isExpanding, setIsExpanding] = useState(false);
  const [pin, setPin] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const handleAcknowledgeClick = () => {
    setIsExpanding(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin.length >= 4) {
      setIsSuccess(true);
      // Wait for success animation before triggering callback and unmounting
      setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => {
          onAcknowledge(task.id, pin);
        }, 300); // Wait for slide out animation
      }, 1500);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -100, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm hover:shadow-sm transition-all duration-300 w-full overflow-hidden"
        >
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2.5 py-1 rounded-md bg-[#E5F4FF] text-[#007BE5] text-xs font-bold tracking-wide uppercase">
                New Controlled Copy
              </span>
            </div>
            
            <p className="text-sm text-slate-600 mb-4">
              คุณได้รับเอกสารควบคุมฉบับใหม่ กรุณากดยอมรับเพื่อนำไปใช้ในพื้นที่ของคุณ
            </p>
            
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-[#F5F5F5] rounded-xl border border-slate-100">
                <FileText className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-lg leading-tight mb-1">{task.docNo}</h4>
                <p className="text-slate-600 font-medium">{task.title}</p>
                <p className="text-sm text-[#666666] mt-1">Rev. {task.rev}</p>
              </div>
            </div>

            <div className="bg-[#F5F5F5] rounded-xl p-4 border border-slate-100 mb-6 flex flex-col items-center justify-center">
              <span className="text-sm text-[#666666] font-medium mb-1">Your Copy No.</span>
              <span className="text-3xl font-bold text-[#1E1E1E] tracking-tight">{task.copyNo}</span>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => onViewPdf(task.docNo, task.rev)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#E5E5E5] text-slate-700 font-medium hover:bg-[#F5F5F5] transition-colors"
              >
                View PDF
              </button>
              
              {!isExpanding && !isSuccess && (
                <button 
                  onClick={handleAcknowledgeClick}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
                >
                  Acknowledge Receipt
                </button>
              )}
            </div>
          </div>

          {/* Expandable PIN Area */}
          <AnimatePresence>
            {isExpanding && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="border-t border-slate-100 bg-[#FAFAFA]"
              >
                <div className="p-6">
                  {isSuccess ? (
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center justify-center py-4"
                    >
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      </div>
                      <p className="font-bold text-slate-800">Acknowledged Successfully</p>
                      <p className="text-sm text-[#666666] mt-1">Thank you for confirming receipt.</p>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col">
                      <label className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-slate-400" />
                        Enter E-Signature PIN
                      </label>
                      <div className="flex gap-3">
                        <input
                          type="password"
                          maxLength={6}
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          placeholder="••••"
                          className="flex-1 rounded-xl border border-[#E5E5E5] px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all text-center tracking-widest text-lg font-mono"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={pin.length < 4}
                          className="w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          <ArrowRight className="w-5 h-5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-3 text-center">
                        Digital Handshake requires your 4-6 digit PIN to verify identity.
                      </p>
                    </form>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AcknowledgmentTaskCard;
