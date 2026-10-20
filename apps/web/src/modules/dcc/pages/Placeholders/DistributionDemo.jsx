import React, { useState } from 'react';
import DistributionSetup from '../../components/workflow/DistributionSetup';
import AcknowledgmentTaskCard from '../../components/workflow/AcknowledgmentTaskCard';
import DistributionTracker from '../../components/workflow/DistributionTracker';

const MOCK_DEPTS = [
  { id: 'PD', name: 'Production (PD)' },
  { id: 'QA', name: 'Quality Assurance (QA)' },
  { id: 'EN', name: 'Engineering (EN)' },
  { id: 'HR', name: 'Human Resources (HR)' },
  { id: 'WH', name: 'Warehouse (WH)' }
];

const MOCK_DOC = {
  docNo: 'WI-24-0012',
  title: 'ขั้นตอนการปฏิบัติงานสำหรับทดสอบระบบ',
  ownerDeptId: 'PD'
};

const MOCK_TASK = {
  id: 'task-101',
  docNo: 'WI-24-0012',
  title: 'ขั้นตอนการปฏิบัติงานสำหรับทดสอบระบบ',
  rev: '01',
  copyNo: '02'
};

const MOCK_RECORDS = [
  { id: 'r1', department: 'Production (PD)', copyNo: '01', sentDate: '2026-07-07 10:00', status: 'Acknowledged', ackDate: '2026-07-07 10:15' },
  { id: 'r2', department: 'Quality Assurance (QA)', copyNo: '02', sentDate: '2026-07-07 10:00', status: 'Pending', ackDate: null },
  { id: 'r3', department: 'Engineering (EN)', copyNo: '03', sentDate: '2026-07-07 10:00', status: 'Pending', ackDate: null },
];

const DistributionDemo = () => {
  const [trackerRecords, setTrackerRecords] = useState(MOCK_RECORDS);

  const handleConfirmDistribution = (distributions) => {
    console.log('Confirmed distributions:', distributions);
    alert('Distributions confirmed! Check console for data.');
  };

  const handleAcknowledge = (taskId, pin) => {
    console.log(`Task ${taskId} acknowledged with PIN ${pin}`);
    
    // Simulate updating tracker
    setTrackerRecords(prev => prev.map(r => 
      r.copyNo === MOCK_TASK.copyNo 
        ? { ...r, status: 'Acknowledged', ackDate: new Date().toLocaleString() } 
        : r
    ));
  };

  const handleRemind = (recordId) => {
    console.log(`Sending reminder for record ${recordId}`);
    alert(`Reminder sent for record ${recordId}!`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 space-y-12 pb-4">
      <div className="max-w-6xl mx-auto space-y-12">
        
        <div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Smart Distribution Module</h1>
          <p className="text-slate-500">Interactive prototype for the Digital Handshake workflows.</p>
        </div>

        {/* Component 1: Setup */}
        <section>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800">1. Distribution Setup (Admin/DCC)</h2>
            <p className="text-sm text-slate-500 mt-1">Appears when document goes Effective. Master copy is locked to owner department.</p>
          </div>
          <DistributionSetup 
            document={MOCK_DOC}
            availableDepartments={MOCK_DEPTS}
            onConfirm={handleConfirmDistribution}
          />
        </section>

        {/* Component 2: Acknowledgment Task */}
        <section>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800">2. Acknowledgment Task Card (User Inbox)</h2>
            <p className="text-sm text-slate-500 mt-1">Appears in receiver's inbox. Try clicking "Acknowledge Receipt".</p>
          </div>
          <div className="max-w-xl">
            <AcknowledgmentTaskCard 
              task={MOCK_TASK}
              onAcknowledge={handleAcknowledge}
              onViewPdf={(doc, rev) => alert(`Viewing PDF for ${doc} Rev ${rev}`)}
            />
          </div>
        </section>

        {/* Component 3: Tracker */}
        <section>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800">3. Distribution Tracker (DCC Dashboard)</h2>
            <p className="text-sm text-slate-500 mt-1">Monitor who has received and acknowledged their copies.</p>
          </div>
          <DistributionTracker 
            docNo={MOCK_DOC.docNo}
            title={MOCK_DOC.title}
            records={trackerRecords}
            onRemind={handleRemind}
          />
        </section>

      </div>
    </div>
  );
};

export default DistributionDemo;
