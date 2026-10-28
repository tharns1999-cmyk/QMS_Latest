import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExternalDocFormModal from '../pages/ExternalDocs/ExternalDocFormModal';
import useStore from '../../../store/useStore';

describe('ExternalDocFormModal PDF dropzone', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({
      currentUser: { id: 'U001', name: 'QA', department: 'QA', level: 1 },
      masterDepartments: [{ id: 'QA', nameTh: 'QA' }],
      externalDocuments: [],
      documentTypes: [{ id: 'ED', code: 'ED', namingPattern: 'ED-{Dept}-{##}' }]
    });
  });

  const open = () => render(<MemoryRouter><ExternalDocFormModal isOpen onClose={() => {}} /></MemoryRouter>);

  it('opens the file picker on click, accepts a dropped PDF and shows its name and size', () => {
    const { container } = open();
    const input = container.querySelector('input[type="file"]');
    const click = vi.spyOn(input, 'click');
    const zone = screen.getByText('คลิกหรือลากไฟล์ PDF มาวางที่นี่').closest('[role="button"]');
    fireEvent.click(zone);
    expect(click).toHaveBeenCalled();

    const file = new File(['%PDF-1.4'], 'spec.pdf', { type: 'application/pdf' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(screen.getByText('spec.pdf')).toBeInTheDocument();
    expect(screen.getByText("0.00 MB")).toBeInTheDocument();
    expect(screen.getByTitle('ลบไฟล์')).toBeInTheDocument();
  });
});
