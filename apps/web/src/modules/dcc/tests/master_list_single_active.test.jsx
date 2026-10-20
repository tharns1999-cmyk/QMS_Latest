import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import MasterList from '../pages/MasterList/MasterList';
import Library from '../pages/Library/Library';

describe('Remove "All Records" Tab & Enforce Atomic Single-Active Revision Status', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.getState().seedSupersededMockHistory();
  });

  it('1. Tab Bar in MasterList does NOT render "ทั้งหมด (All Records)" tab button', () => {
    render(
      <MemoryRouter>
        <MasterList />
      </MemoryRouter>
    );

    // Verify "ทั้งหมด (All Records)" is NOT present in the tab bar
    expect(screen.queryByRole('button', { name: /ทั้งหมด \(All Records\)/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/ทั้งหมด \(All Records\)/i)).not.toBeInTheDocument();

    // Verify exactly 3 distinct status tabs exist
    expect(screen.getByRole('button', { name: /มีผลบังคับใช้ \(Active\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ฉบับตกรุ่น \(Superseded\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ยกเลิกถาวร \(Obsolete\)/i })).toBeInTheDocument();
  });

  it('1b. Tab Bar in Library does NOT render "ทั้งหมด (All Records)" tab button', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Verify "ทั้งหมด (All Records)" is NOT present in Library
    expect(screen.queryByRole('button', { name: /ทั้งหมด \(All Records\)/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/ทั้งหมด \(All Records\)/i)).not.toBeInTheDocument();

    // Verify exactly 3 distinct status tabs exist
    expect(screen.getByRole('button', { name: /มีผลบังคับใช้ \(Active\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ฉบับตกรุ่น \(Superseded\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ยกเลิกถาวร \(Obsolete\)/i })).toBeInTheDocument();
  });

  it('2. Active tab enforces Single-Active ISO 9001: exactly 1 active version for WI-QC-01 and badges match table count', () => {
    render(
      <MemoryRouter>
        <MasterList />
      </MemoryRouter>
    );

    // Default tab is Active
    const activeTabBtn = screen.getByRole('button', { name: /มีผลบังคับใช้ \(Active\)/i });
    expect(activeTabBtn).toBeInTheDocument();

    // In QC department filter or overall, verify WI-QC-01 renders ONLY ONCE in the active table
    const qcRows = screen.getAllByRole('row').filter(row => row.textContent.includes('WI-QC-01'));
    expect(qcRows.length).toBe(1);

    // Older revision Rev.00 must NOT be in the active table
    expect(qcRows[0].textContent).not.toContain('Rev.00');
  });

  it('3. Older revisions (WI-QC-01 Rev.00) reside in "ฉบับตกรุ่น (Superseded)" tab', () => {
    render(
      <MemoryRouter>
        <MasterList />
      </MemoryRouter>
    );

    // Click on Superseded Tab
    const supersededBtn = screen.getByRole('button', { name: /ฉบับตกรุ่น \(Superseded\)/i });
    fireEvent.click(supersededBtn);

    // WI-QC-01 must be present in superseded list with historical revisions
    expect(screen.getByText('WI-QC-01')).toBeInTheDocument();
    expect(screen.getByText(/Rev\.00/i)).toBeInTheDocument();
  });

  it('4. promoteDarToEffective atomically sets all previous revisions to SUPERSEDED', () => {
    const store = useStore.getState();

    // Create a new DAR promoting WI-QC-01 to Rev.03
    const newDar = {
      id: 'DAR-TEST-009',
      dar_no: 'DAR-TEST-009',
      darNo: 'DAR-TEST-009',
      document_code: 'WI-QC-01',
      doc_code: 'WI-QC-01',
      title: 'WI-QC-01',
      document_title: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า Rev.03',
      target_revision: '03',
      revision: '03',
      previous_revision: '02',
      effective_date: '2026-12-01',
      department: 'QC',
      status: 'APPROVED'
    };

    useStore.setState((state) => ({
      dars: [...state.dars, newDar]
    }));

    store.promoteDarToEffective('DAR-TEST-009');

    const qcDocs = useStore.getState().documents.filter(d => 
      (d.document_code || d.doc_code || d.code || d.title || '').trim().toUpperCase() === 'WI-QC-01'
    );

    // Check that ONLY Rev.03 is EFFECTIVE
    const activeQcDocs = qcDocs.filter(d => d.status === 'EFFECTIVE' || d.status === 'ACTIVE');
    expect(activeQcDocs.length).toBe(1);
    expect(String(activeQcDocs[0].revision || activeQcDocs[0].rev).replace(/\D/g, '')).toBe('03');

    // All prior revisions (00, 01, 02) must be SUPERSEDED
    const supersededQcDocs = qcDocs.filter(d => d.status === 'SUPERSEDED');
    const supersededRevs = supersededQcDocs.map(d => String(d.revision || d.rev).replace(/\D/g, ''));
    expect(supersededRevs).toContain('00');
    expect(supersededRevs).toContain('01');
    expect(supersededRevs).toContain('02');
  });
});
