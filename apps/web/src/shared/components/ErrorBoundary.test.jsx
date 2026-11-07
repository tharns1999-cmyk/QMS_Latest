import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

const Boom = () => {
  throw new Error('render exploded');
};

describe('ErrorBoundary error tracking hook', () => {
  afterEach(() => vi.restoreAllMocks());

  it('announces a render crash with qms:client-error and still shows the fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = vi.fn();
    window.addEventListener('qms:client-error', listener);
    render(<ErrorBoundary fallback={<p>fallback shown</p>}><Boom /></ErrorBoundary>);
    window.removeEventListener('qms:client-error', listener);
    expect(screen.getByText('fallback shown')).toBeInTheDocument();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.error.message).toBe('render exploded');
  });
});
