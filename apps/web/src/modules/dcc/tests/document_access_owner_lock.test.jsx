import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentAccessControlSelector from '../components/workflow/DocumentAccessControlSelector';

describe('DocumentAccessControlSelector: TARGETED owner department lock', () => {
  it('locks the owner department and keeps it when other departments are toggled', () => {
    const handleChange = vi.fn();
    render(
      <DocumentAccessControlSelector
        value={{ scope: 'TARGETED', authorized_depts: ['PD'], authorized_users: [], min_access_level: 4 }}
        onChange={handleChange}
        ownerDept="PD"
        masterDepartments={[{ id: 'PD' }, { id: 'QA' }, { id: 'WH' }]}
      />
    );

    // Owner department is a locked, non-interactive tile
    expect(screen.getByText(/เจ้าของ \(ล็อก\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^PD/ })).not.toBeInTheDocument();

    const qaBtn = screen.getByRole('button', { name: /^QA/ });
    expect(qaBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(qaBtn);
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      authorized_depts: expect.arrayContaining(['PD', 'QA'])
    }));
  });
});
