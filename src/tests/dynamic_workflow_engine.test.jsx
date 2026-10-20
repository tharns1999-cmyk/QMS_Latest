import { describe, it, expect } from 'vitest';
import { generateDynamicWorkflow } from '../utils/workflowEngine';
import { resolveProgressiveSignatories } from '../utils/signatoryResolver';
import useStore from '../store/useStore';

describe('Rule-Based Dynamic Workflow Engine & Signatory Resolver', () => {
  const mockMasterUsers = [
    {
      id: 'U001',
      name: 'ธนาวุฒิ สมควรกิจดำรง',
      level: 4,
      department: 'DC',
      status: 'ACTIVE',
      position: 'Document Controller'
    },
    {
      id: 'U002',
      name: 'ศิรภัสสร ผลเจริญ',
      level: 3,
      department: 'PD',
      status: 'ACTIVE',
      position: 'Production Officer'
    },
    {
      id: 'U003',
      name: 'กัลยาณี พลไกร',
      level: 5,
      department: 'PD',
      secondaryDepartments: ['QC'],
      departments: ['PD', 'QC'],
      status: 'ACTIVE',
      position: 'Production Assistant Manager',
      signatureImage: 'data:image/png;base64,mockSigKalyanee'
    },
    {
      id: 'U004',
      name: 'คุณเรย์',
      level: 6,
      department: 'MGMT',
      status: 'ACTIVE',
      position: 'General Manager / QMR',
      isQmr: true,
      signatureImage: 'data:image/png;base64,mockSigRay'
    },
    {
      id: 'U005',
      name: 'บีม',
      level: 4,
      department: 'QC',
      status: 'ACTIVE',
      position: 'QAQC Supervisor',
      signatureImage: 'data:image/png;base64,mockSigBeam'
    },
    {
      id: 'U006',
      name: 'รัตนพล สมใจ',
      level: 4,
      department: 'EN',
      status: 'ACTIVE',
      position: 'Engineering Supervisor'
    },
    {
      id: 'U007',
      name: 'ชัยวัฒน์ พัฒนเดช',
      level: 5,
      department: 'EN',
      status: 'ACTIVE',
      position: 'Engineering Assistant Manager',
      signatureImage: 'data:image/png;base64,mockSigChaiwat'
    },
    {
      id: 'U008',
      name: 'กิตติศักดิ์ มั่นคง',
      level: 7,
      department: 'FIN',
      status: 'ACTIVE',
      position: 'Finance Director'
    },
    {
      id: 'U009',
      name: 'ณัฐวุฒิ วิเศษศักดิ์',
      level: 8,
      department: 'EXEC',
      status: 'ACTIVE',
      position: 'Managing Director',
      signatureImage: 'data:image/png;base64,mockSigNut'
    }
  ];

  describe('Rule-Based Dynamic Workflow Generator (Criterion 2)', () => {
    it('selects Kalyanee (U003, Level 5 QC) as reviewer when creating DAR for QC department', () => {
      const requester = mockMasterUsers.find(u => u.id === 'U005'); // Beam (QC L4)
      const steps = generateDynamicWorkflow(requester, 'QC', mockMasterUsers);

      expect(steps).toHaveLength(3);
      // Step 1: Requester
      expect(steps[0].step).toBe(1);
      expect(steps[0].role).toBe('REQUESTER');
      expect(steps[0].userId).toBe('U005');
      expect(steps[0].userName).toBe('บีม');
      expect(steps[0].status).toBe('COMPLETED');

      // Step 2: Reviewer -> Kalyanee (U003, Level 5 matching QC via secondaryDepartments)
      expect(steps[1].step).toBe(2);
      expect(steps[1].role).toBe('REVIEWER');
      expect(steps[1].userId).toBe('U003');
      expect(steps[1].userName).toBe('กัลยาณี พลไกร');
      expect(steps[1].status).toBe('PENDING');

      // Step 3: Approver -> Ray (U004, Level 6 MGMT)
      expect(steps[2].step).toBe(3);
      expect(steps[2].role).toBe('APPROVER');
      expect(steps[2].userId).toBe('U004');
      expect(steps[2].userName).toBe('คุณเรย์');
      expect(steps[2].status).toBe('PENDING');
    });

    it('selects Chaiwat (U007, Level 5 EN) as reviewer when creating DAR for EN department', () => {
      const requester = mockMasterUsers.find(u => u.id === 'U006'); // Rattanapol (EN L4)
      const steps = generateDynamicWorkflow(requester, 'EN', mockMasterUsers);

      expect(steps).toHaveLength(3);
      // Step 2: Reviewer -> Chaiwat (U007, Level 5 in EN)
      expect(steps[1].role).toBe('REVIEWER');
      expect(steps[1].userId).toBe('U007');
      expect(steps[1].userName).toBe('ชัยวัฒน์ พัฒนเดช');
      expect(steps[1].status).toBe('PENDING');

      // Step 3: Approver -> Ray (U004, Level 6 MGMT)
      expect(steps[2].role).toBe('APPROVER');
      expect(steps[2].userId).toBe('U004');
      expect(steps[2].userName).toBe('คุณเรย์');
    });

    it('escalates to central quality executive (MGMT L6) when department has no Level 5 user', () => {
      const requester = mockMasterUsers.find(u => u.id === 'U008'); // Kit (FIN)
      const steps = generateDynamicWorkflow(requester, 'FIN', mockMasterUsers);

      expect(steps).toHaveLength(3);
      // Step 2: Reviewer fallback to MGMT/QMR L6 -> Ray (U004)
      expect(steps[1].role).toBe('REVIEWER');
      expect(steps[1].userId).toBe('U004');
      expect(steps[1].userName).toBe('คุณเรย์');

      // Step 3: Approver must be distinct from reviewer (L6+ MGMT/EXEC) -> Nut (U009, EXEC L8)
      expect(steps[2].role).toBe('APPROVER');
      expect(steps[2].userId).toBe('U009');
      expect(steps[2].userName).toBe('ณัฐวุฒิ วิเศษศักดิ์');
    });

    it('never assigns the requester as their own reviewer or approver (segregation of duties)', () => {
      const requester = mockMasterUsers.find(u => u.id === 'U003'); // QC L5 - previously picked as own reviewer
      const steps = generateDynamicWorkflow(requester, 'QC', mockMasterUsers);
      expect(steps[1].userId).not.toBe('U003');
      expect(steps[2].userId).not.toBe('U003');
      expect(steps[2].userId).not.toBe(steps[1].userId);
    });

    it('uses reviewer/approver levels from the Approval Matrix', () => {
      const requester = mockMasterUsers.find(u => u.id === 'U006'); // EN L4
      const matrix = [{ docType: 'SOP', requiredReviewerLevel: 6, requiredApproverLevel: 8 }];
      const steps = generateDynamicWorkflow(requester, 'EN', mockMasterUsers, 'SOP', matrix);
      expect(steps[1].userId).toBe('U004'); // EN L5 below threshold -> escalates to MGMT
      expect(steps[2].userId).toBe('U009'); // only EXEC L8 meets approver level 8
    });
  });

  describe('Dynamic Signatory Resolver (Criteria 1 & 3)', () => {
    it('returns empty strings and null signature for incomplete steps with ZERO hardcoded names', () => {
      const requester = mockMasterUsers.find(u => u.id === 'U005');
      const steps = generateDynamicWorkflow(requester, 'QC', mockMasterUsers);

      const dar = {
        id: 'DAR-2026-001',
        title: 'SOP-QC-001 Verification Procedure',
        department: 'QC',
        status: 'UNDER_REVIEW',
        requesterId: 'U005',
        workflowSteps: steps,
        workflowHistory: []
      };

      const result = resolveProgressiveSignatories({
        dar,
        stage: 'REVIEW',
        masterUsers: mockMasterUsers
      });

      // Requester is completed
      expect(result.requester.isCompleted).toBe(true);
      expect(result.requester.name).toBe('บีม');
      expect(result.requester.signatureImage).toBe('data:image/png;base64,mockSigBeam');

      // Reviewer is NOT completed yet
      expect(result.reviewer.isCompleted).toBe(false);
      expect(result.reviewer.name).toBe('');
      expect(result.reviewer.position).toBe('');
      expect(result.reviewer.date).toBe('');
      expect(result.reviewer.signatureImage).toBeNull();

      // Approver is NOT completed yet
      expect(result.approver.isCompleted).toBe(false);
      expect(result.approver.name).toBe('');
      expect(result.approver.position).toBe('');
      expect(result.approver.date).toBe('');
      expect(result.approver.signatureImage).toBeNull();
    });

    it('populates reviewer info dynamically when reviewer approves', () => {
      const requester = mockMasterUsers.find(u => u.id === 'U005');
      const steps = generateDynamicWorkflow(requester, 'QC', mockMasterUsers);

      const dar = {
        id: 'DAR-2026-001',
        title: 'SOP-QC-001 Verification Procedure',
        department: 'QC',
        status: 'PENDING_APPROVAL',
        requesterId: 'U005',
        workflowSteps: steps,
        workflowHistory: [
          {
            step: 2,
            role: 'REVIEWER',
            action: 'REVIEW',
            userId: 'U003',
            userName: 'กัลยาณี พลไกร',
            timestamp: '2026-08-15T10:30:00.000Z'
          }
        ]
      };

      const result = resolveProgressiveSignatories({
        dar,
        stage: 'APPROVE',
        masterUsers: mockMasterUsers
      });

      // Reviewer is completed
      expect(result.reviewer.isCompleted).toBe(true);
      expect(result.reviewer.name).toBe('กัลยาณี พลไกร');
      expect(result.reviewer.position).toBe('Production Assistant Manager');
      expect(result.reviewer.signatureImage).toBe('data:image/png;base64,mockSigKalyanee');
      expect(result.reviewer.date).toBe('15/08/2569');

      // Approver is NOT completed
      expect(result.approver.isCompleted).toBe(false);
      expect(result.approver.name).toBe('');
      expect(result.approver.signatureImage).toBeNull();
    });

    it('populates approver info dynamically when approver approves', () => {
      const requester = mockMasterUsers.find(u => u.id === 'U006'); // EN
      const steps = generateDynamicWorkflow(requester, 'EN', mockMasterUsers);

      const dar = {
        id: 'DAR-2026-002',
        title: 'WI-EN-001 Maintenance Standard',
        department: 'EN',
        status: 'APPROVED',
        requesterId: 'U006',
        workflowSteps: steps,
        workflowHistory: [
          {
            step: 2,
            role: 'REVIEWER',
            action: 'REVIEW',
            userId: 'U007',
            userName: 'ชัยวัฒน์ พัฒนเดช',
            timestamp: '2026-08-16T09:00:00.000Z'
          },
          {
            step: 3,
            role: 'APPROVER',
            action: 'APPROVE',
            userId: 'U004',
            userName: 'คุณเรย์',
            timestamp: '2026-08-17T14:20:00.000Z'
          }
        ]
      };

      const result = resolveProgressiveSignatories({
        dar,
        stage: 'MASTER',
        masterUsers: mockMasterUsers
      });

      // Reviewer (Chaiwat - EN)
      expect(result.reviewer.isCompleted).toBe(true);
      expect(result.reviewer.name).toBe('ชัยวัฒน์ พัฒนเดช');
      expect(result.reviewer.date).toBe('16/08/2569');
      expect(result.reviewer.signatureImage).toBe('data:image/png;base64,mockSigChaiwat');

      // Approver (Ray - MGMT)
      expect(result.approver.isCompleted).toBe(true);
      expect(result.approver.name).toBe('คุณเรย์');
      expect(result.approver.date).toBe('17/08/2569');
      expect(result.approver.signatureImage).toBe('data:image/png;base64,mockSigRay');
    });
  });

  describe('Zustand useStore addDar integration', () => {
    it('automatically generates workflowSteps and maps reviewerId and approverId', () => {
      const store = useStore.getState();
      const newDarPayload = {
        title: 'WI-EN-099 Test Manual',
        docType: 'WI',
        department: 'EN',
        requesterId: 'U006',
        isDraft: false
      };

      store.addDar(newDarPayload);

      const added = useStore.getState().dars.find(d => d.title === 'WI-EN-099 Test Manual');
      expect(added).toBeDefined();
      expect(added.workflowSteps).toBeDefined();
      expect(added.workflowSteps).toHaveLength(3);
      expect(added.reviewerId).toBe('U007'); // Chaiwat (EN L5)
      expect(added.reviewerName).toBe('ชัยวัฒน์');
      expect(added.approverId).toBe('U004'); // Ray (MGMT L6)
      expect(added.approverName).toBe('คุณเรย์');
    });
  });
});
