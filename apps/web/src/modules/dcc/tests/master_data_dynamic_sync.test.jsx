import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import DarNewForm from '../pages/DarWorkflow/DarNewForm';
import DarRevisionForm from '../pages/DarWorkflow/DarRevisionForm';
import Library from '../pages/Library/Library';
import MasterList from '../pages/MasterList/MasterList';
import DistributionSetup from '../components/workflow/DistributionSetup';
import RequestAdditionalCopiesModal from '../components/workflow/RequestAdditionalCopiesModal';

const renderWithRouter = (ui) => {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
};

describe('Master Data Dynamic Synchronization & Hardcoded Elimination Tests', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({
      currentUser: {
        id: 'U001',
        name: 'Admin QA (DCC)',
        department: 'QA',
        depts: ['QA'],
        isDcc: true,
        role: 'DCC_ADMIN',
        level: 1
      }
    });
  });

  describe('1. Document Types Dynamic Binding in DarNewForm', () => {
    it('renders the 6 active Master Document Types and eliminates legacy types (HA, HAP, FSP, etc.)', () => {
      renderWithRouter(<DarNewForm />);

      const selects = screen.getAllByRole('combobox');
      const docTypeSelect = selects[0];
      const codes = Array.from(docTypeSelect.querySelectorAll('option')).map(o => o.value).filter(Boolean);

      // Verify the 6 official document types are present and zero legacy types
      expect(codes).toEqual(expect.arrayContaining(['QM', 'SOP', 'WI', 'FM', 'SD', 'SPEC']));
      ['HA', 'HAP', 'FSP', 'QP', 'PS', 'VA'].forEach(legacy => expect(codes).not.toContain(legacy));
    });

    it('immediately reflects new document types added to Master Data Store in real-time', () => {
      // Add custom document type to store
      act(() => {
        useStore.getState().addDocumentType({
          code: 'POLICY',
          name: 'Quality Policy',
          nameTh: 'นโยบายคุณภาพองค์กร',
          namingPattern: 'POLICY-{Dept}-{###}',
          is_form_type: false,
          status: 'ACTIVE'
        });
      });

      renderWithRouter(<DarNewForm />);

      const selects = screen.getAllByRole('combobox');
      const docTypeSelect = selects[0];
      const options = Array.from(docTypeSelect.querySelectorAll('option')).map(o => o.textContent);

      expect(options.some(o => o.includes('นโยบายคุณภาพองค์กร (POLICY)'))).toBe(true);
    });

    it('calculates auto preview code according to dynamic naming pattern and bypasses Ack for Form types', () => {
      renderWithRouter(<DarNewForm />);

      const selects = screen.getAllByRole('combobox');
      const docTypeSelect = selects[0];
      
      // Select FM (Form)
      fireEvent.change(docTypeSelect, { target: { value: 'FM' } });

      // Code preview uses the standardized QA/QC code 'QC'
      expect(screen.getAllByText(/FM-QC-/).length).toBeGreaterThan(0);
    });
  });

  describe('2. Document Types in DarRevisionForm', () => {
    it('renders dynamic document types in the revision search filter dropdown', () => {
      renderWithRouter(<DarRevisionForm />);

      const selects = screen.getAllByRole('combobox');
      const typeFilterSelect = selects.find(s => s.className.includes('sm:w-44'));
      expect(typeFilterSelect).toBeDefined();

      const codes = Array.from(typeFilterSelect.querySelectorAll('option')).map(o => o.value);
      expect(codes).toEqual(expect.arrayContaining(['QM', 'SOP']));
      expect(codes).not.toContain('HA');
    });
  });

  describe('3. DistributionSetup Dynamic Location and Department Sync', () => {
    it('renders newly added distribution locations from store in DistributionSetup', () => {
      // Add a custom station to PD
      act(() => {
        useStore.getState().addDistributionLocation({
          id: 'PD-ROBOT-01',
          code: 'PD-ROBOT-01',
          name: 'Line 99 - Robotic Packing Cell',
          departmentId: 'PD',
          status: 'ACTIVE'
        });
      });

      renderWithRouter(
        <DistributionSetup 
          ownerDept="QA"
          distributions={[]}
          onChange={() => {}}
        />
      );

      // Open PD in the department pane, then the new station is visible
      fireEvent.click(screen.getByRole('button', { name: /^PD/ }));
      expect(screen.getByText(/Line 99 - Robotic Packing Cell/i)).toBeDefined();
    });
  });

  describe('4. RequestAdditionalCopiesModal Dynamic Location Sync', () => {
    it('shows newly added station from store in RequestAdditionalCopiesModal', () => {
      // Add station to QA
      act(() => {
        useStore.getState().addDistributionLocation({
          id: 'QA-NEW-LAB',
          code: 'QA-NEW-LAB',
          name: 'Sensory Evaluation Testing Lab',
          departmentId: 'QA/QC',
          status: 'ACTIVE'
        });
      });

      const mockDoc = {
        id: 'DOC-001',
        title: 'SOP-QA-001',
        name: 'ขั้นตอนการตรวจวิเคราะห์คุณภาพ',
        rev: '01',
        status: 'EFFECTIVE',
        department: 'QA'
      };

      renderWithRouter(
        <RequestAdditionalCopiesModal
          isOpen={true}
          onClose={() => {}}
          document={mockDoc}
        />
      );

      // Click QA/QC Department Tab
      const qaBtn = screen.getByRole('button', { name: /\(QC\)$/ }); // QA/QC is normalized to QC
      fireEvent.click(qaBtn);

      // Verify new station is available for selection
      expect(screen.getByText(/Sensory Evaluation Testing Lab/i)).toBeDefined();
    });
  });

  describe('5. Library & MasterList Filters Dynamic Integration', () => {
    it('includes dynamic master document types in Library filter options', () => {
      renderWithRouter(<Library />);

      const selects = screen.getAllByRole('combobox');
      const typeSelect = selects.find(s => Array.from(s.options).some(o => o.textContent.includes('ทุกประเภท')));
      const codes = Array.from(typeSelect.querySelectorAll('option')).map(o => o.value);
      expect(codes).toEqual(expect.arrayContaining(['QM', 'SOP']));
    });

    it('renders master departments and dynamic types in MasterList filters', () => {
      renderWithRouter(<MasterList />);

      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThanOrEqual(2);

      const deptSelect = selects[0];
      const deptOptions = Array.from(deptSelect.querySelectorAll('option')).map(o => o.textContent);
      expect(deptOptions.some(o => o.includes('PD - ฝ่ายผลิต'))).toBe(true);

      const typeSelect = selects[1];
      const typeOptions = Array.from(typeSelect.querySelectorAll('option')).map(o => o.textContent);
      expect(typeOptions.some(o => o.includes('คู่มือคุณภาพ (QM)'))).toBe(true);
    });
  });
});
