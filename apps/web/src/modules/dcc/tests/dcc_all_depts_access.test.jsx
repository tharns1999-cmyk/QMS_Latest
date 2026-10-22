import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Library from '../pages/Library/Library';
import ExternalDocsList from '../pages/ExternalDocs/ExternalDocsList';
import useStore from '../../../store/useStore';
import { toStoreDocument } from '../../../api/session';
import { toStoreExternalDoc } from '../../../api/external';

// The local DB's real case: QA's documents are General and fully retired, and the DCC belongs to DC, not QA.
const row = (doc_code, revision, status, doc_type) => ({
  id: `${doc_code}-${revision}`, doc_code, revision, status, doc_type, name: `${doc_code} title`,
  department: 'QA', access_scope: 'GENERAL', effective_date: '2026-01-01', file_key: `k/${doc_code}-${revision}`
});
const internal = [row('SOP-QA-01', '00', 'SUPERSEDED', 'SOP'), row('SOP-QA-01', '01', 'SUPERSEDED', 'SOP'), row('SOP-QA-01', '02', 'OBSOLETE', 'SOP')].map(toStoreDocument);
const external = [row('ED-QA-01', '00', 'SUPERSEDED', 'ED'), row('ED-QA-01', '01', 'OBSOLETE', 'ED')].map(toStoreExternalDoc);

const dcc = { id: 'dc4', name: 'DC หัวหน้า (DCC)', department: 'DC', depts: ['DC'], approval_level: 4, isDcc: true };
const pd = { id: 'pd4', name: 'PD หัวหน้า', department: 'PD', depts: ['PD'], approval_level: 4, isDcc: false };

const renderPage = (Page) => render(<MemoryRouter><Page /></MemoryRouter>);

describe('DCC sees the whole register, every department and every status', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({ documents: internal, externalDocuments: external, masterDepartments: [{ id: 'QA', nameTh: 'QA' }, { id: 'DC', nameTh: 'DC' }, { id: 'PD', nameTh: 'PD' }] });
  });

  it('internal library: DCC opens on "ทุกแผนก" and finds QA superseded and obsolete documents', () => {
    useStore.setState({ currentUser: dcc });
    renderPage(Library);
    expect(screen.getByRole('button', { name: 'ทุกแผนก (DCC)' })).toHaveClass('font-bold');
    fireEvent.click(screen.getByRole('button', { name: /^ยกเลิกถาวร \(Obsolete\)/ }));
    expect(screen.getAllByText(/SOP-QA-01/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /^ฉบับตกรุ่น \(Superseded\)/ }));
    expect(screen.getAllByText(/SOP-QA-01/).length).toBeGreaterThan(0);
  });

  it('external library: DCC opens on "ทุกแผนก" and finds QA superseded and obsolete documents', () => {
    useStore.setState({ currentUser: dcc });
    renderPage(ExternalDocsList);
    expect(screen.getByRole('button', { name: 'ทุกแผนก (DCC)' })).toHaveClass('font-bold');
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิกถาวร \(Obsolete\)/ }));
    expect(screen.getAllByText('ED-QA-01').length).toBeGreaterThan(0);
  });

  it('other departments get no "ทุกแผนก" tab and still see effective documents only', () => {
    useStore.setState({ currentUser: pd });
    renderPage(Library);
    expect(screen.queryByRole('button', { name: 'ทุกแผนก (DCC)' })).not.toBeInTheDocument();
    expect(screen.queryByText(/SOP-QA-01/)).not.toBeInTheDocument();
  });
});
