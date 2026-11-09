import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModuleGovernancePage from '../pages/ModuleGovernancePage';
import { apiGet, apiPut } from '../../../api/client';
vi.mock('../../../api/client',()=>({isApiMode:false,apiGet:vi.fn(),apiPut:vi.fn(),apiPost:vi.fn(),apiDelete:vi.fn()}));
it('clearly identifies demo mode and never pretends to enforce or save backend governance',()=>{
  render(<MemoryRouter><ModuleGovernancePage /></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('โหมดสาธิต');
  expect(screen.queryByRole('button',{name:'ตรวจผลกระทบ'})).not.toBeInTheDocument();
  expect(apiGet).not.toHaveBeenCalled();expect(apiPut).not.toHaveBeenCalled();
});
