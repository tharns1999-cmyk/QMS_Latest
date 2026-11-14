import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TryoutUserSwitcher, { TRYOUT_SWITCHER } from '../auth/TryoutUserSwitcher';
import { getToken, setToken } from '../../api/client';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const roster = [
  { id: 'qa2', name: 'QA เจ้าหน้าที่', email: 'qa2@t.co', department: 'QA', level: 2, position: '' },
  { id: 'qa4', name: 'QA หัวหน้า', email: 'qa4@t.co', department: 'QA', level: 4, position: '' }
];

describe('tryout user switcher (local tryout only)', () => {
  const realLocation = window.location;
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true });
    setToken(null);
  });

  it('is switched off in every build that does not ask for it', () => {
    expect(TRYOUT_SWITCHER).toBe(false);
  });

  it('shows nothing when the tryout has no list of people', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(404, {})));
    const { container } = render(<TryoutUserSwitcher currentId="qa2" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('signs in as the chosen person through the ordinary sign-in, then starts fresh', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...realLocation, reload }, writable: true, configurable: true });
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('/tryout-users.json')) return json(200, roster);
      if (String(url).endsWith('/api/auth/login')) return json(200, { token: 'token-of-qa4', user: {} });
      return json(404, {});
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<TryoutUserSwitcher currentId="qa2" />);

    fireEvent.click(await screen.findByTestId('searchable-select-trigger'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('QA หัวหน้า (QA) L4'));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    const loginCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/auth/login'));
    expect(JSON.parse(loginCall[1].body)).toEqual({ email: 'qa4@t.co', password: '1234' });
    expect(getToken()).toBe('token-of-qa4');
  });

  it('keeps the current session and says why when the sign-in is refused', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...realLocation, reload }, writable: true, configurable: true });
    setToken('current-token');
    vi.stubGlobal('fetch', vi.fn((url) => (String(url).endsWith('/tryout-users.json') ? json(200, roster) : json(401, { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }))));
    render(<TryoutUserSwitcher currentId="qa2" />);

    fireEvent.click(await screen.findByTestId('searchable-select-trigger'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('QA หัวหน้า (QA) L4'));

    expect(await screen.findByRole('alert')).toHaveTextContent('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    expect(reload).not.toHaveBeenCalled();
    expect(getToken()).toBe('current-token');
  });

  it('does nothing when the person already signed in is chosen again', async () => {
    const fetchMock = vi.fn((url) => (String(url).endsWith('/tryout-users.json') ? json(200, roster) : json(200, { token: 'x' })));
    vi.stubGlobal('fetch', fetchMock);
    render(<TryoutUserSwitcher currentId="qa2" />);
    fireEvent.click(await screen.findByTestId('searchable-select-trigger'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('QA เจ้าหน้าที่ (QA) L2'));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/auth/login'))).toBe(false);
  });
});
