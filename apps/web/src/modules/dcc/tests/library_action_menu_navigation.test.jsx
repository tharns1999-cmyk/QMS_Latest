import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import Library from '../pages/Library/Library';
import useStore from '../../../store/useStore';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe('Library Action Menu Navigation & Stacking Context Tests', () => {
  const mockNavigate = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
    useStore.setState({
      currentUser: {
        id: 'U001',
        name: 'John QA',
        department: 'QA',
        role: 'USER'
      },
      documents: [
        {
          id: 'doc-123',
          document_code: 'WI-QA-01',
          title: 'WI-QA-01',
          name: 'คู่มือการทดสอบระบบ',
          department: 'QA',
          status: 'EFFECTIVE',
          rev: '00',
          revision: '00'
        }
      ],
      masterDepartments: [],
      documentTypes: []
    });
  });

  it('applies z-50 class to the cell when menu is opened', async () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    const docName = await screen.findByText('คู่มือการทดสอบระบบ');
    expect(docName).toBeInTheDocument();

    const moreBtn = screen.getByTitle(/เมนู.*เพิ่มเติม/i);
    fireEvent.click(moreBtn);

    const cell = moreBtn.closest('td');
    expect(cell.className).toContain('z-50');
    expect(cell.className).not.toContain('z-1');
  });

  it('navigates to DAR obsolete route when ขอยกเลิกเอกสารฉบับนี้ is clicked', async () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    const moreBtn = screen.getByTitle(/เมนู.*เพิ่มเติม/i);
    fireEvent.click(moreBtn);

    const obsoleteBtn = screen.getByText('ขอยกเลิกเอกสารฉบับนี้');
    fireEvent.click(obsoleteBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/dar/obsolete', {
      state: {
        selectedDocId: 'doc-123',
        targetDocCode: 'WI-QA-01',
        targetDocTitle: 'WI-QA-01',
        currentRevision: '00'
      }
    });
  });

  it('navigates to DAR revision route when ยื่นคำร้องขอแก้ไขฉบับใหม่ is clicked', async () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    const moreBtn = screen.getByTitle(/เมนู.*เพิ่มเติม/i);
    fireEvent.click(moreBtn);

    const reviseBtn = screen.getByText('ยื่นคำร้องขอแก้ไขฉบับใหม่');
    fireEvent.click(reviseBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/dar/new', {
      state: {
        darType: 'REVISION',
        selectedDocId: 'doc-123',
        targetDocCode: 'WI-QA-01',
        targetDocTitle: 'WI-QA-01',
        currentRevision: '00'
      }
    });
  });

  it('navigates to controlled-copies request route when ขอสำเนาควบคุมเพิ่มเติม is clicked', async () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    const moreBtn = screen.getByTitle(/เมนู.*เพิ่มเติม/i);
    fireEvent.click(moreBtn);

    const reqBtn = screen.getByText('ขอสำเนาควบคุมเพิ่มเติม');
    fireEvent.click(reqBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/controlled-copies/request', {
      state: {
        targetDocCode: 'WI-QA-01',
        targetDocTitle: 'WI-QA-01',
        currentRevision: '00'
      }
    });
  });
});
