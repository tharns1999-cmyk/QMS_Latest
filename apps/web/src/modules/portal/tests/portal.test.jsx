import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PortalLandingPage from '../pages/PortalLandingPage';
import useStore from '../../../store/useStore';

describe('Portal Architecture & Landing Page', () => {
  beforeEach(() => {
    localStorage.setItem('language', 'en');
    useStore.setState({
      currentUser: { id: 'u1', name: 'Tester', department: 'Test Dept', permissions: ['DCC_ACCESS'] }
    });
  });

  it('renders Portal Landing Page with module cards', () => {
    render(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<PortalLandingPage />} />
        </Routes>
      </MemoryRouter>
    );
    
    // Check main title
    expect(screen.getByText('QMS Portal')).toBeInTheDocument();
    expect(screen.getByText('Quality Management System Portal')).toBeInTheDocument();

    expect(screen.getByText('ระบบควบคุมเอกสาร (DCC)')).toBeInTheDocument();
    

  });
});
