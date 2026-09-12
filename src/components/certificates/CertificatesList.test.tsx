import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listCertificates } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { renderWithProviders } from '../../test/utils';
import type { CertificateItem } from '../../types';
import { CertificateDetails } from './CertificateDetails';
import { CertificatesList } from './CertificatesList';

vi.mock('../../services/tauri', () => ({ listCertificates: vi.fn() }));

const initialState = useAppStore.getState();

const makeCertificate = (overrides: Partial<CertificateItem> = {}): CertificateItem => ({
  id: 'https://vault.vault.azure.net/certificates/api-tls/def456',
  name: 'api-tls',
  enabled: true,
  created: '2026-01-01T10:00:00Z',
  updated: '2026-02-01T10:00:00Z',
  expires: '2027-01-01T10:00:00Z',
  notBefore: null,
  subject: 'CN=api.contoso.com',
  thumbprint: 'AA11BB22CC33',
  tags: null,
  ...overrides,
});

beforeEach(() => {
  useAppStore.setState(initialState, true);
  useAppStore.setState({ selectedVaultUri: 'https://vault/', selectedVaultName: 'vault' });
  vi.mocked(listCertificates).mockReset();
});

describe('CertificatesList', () => {
  it('renders subject and thumbprint columns', async () => {
    vi.mocked(listCertificates).mockResolvedValue([makeCertificate()]);
    renderWithProviders(<CertificatesList />);

    expect(await screen.findByText('api-tls')).toBeInTheDocument();
    expect(screen.getByText('CN=api.contoso.com')).toBeInTheDocument();
    expect(screen.getByText('AA11BB22CC33')).toBeInTheDocument();
  });

  it('marks an expired certificate and sorts by name on demand', async () => {
    vi.mocked(listCertificates).mockResolvedValue([
      makeCertificate({ id: 'c2', name: 'zeta-tls' }),
      makeCertificate({ id: 'c1', name: 'alpha-tls', expires: '2020-01-01T00:00:00Z' }),
    ]);
    renderWithProviders(<CertificatesList />);
    await screen.findByText('alpha-tls');

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelectorAll('td')[1]?.textContent);
    expect(names).toEqual(['alpha-tls', 'zeta-tls']);
  });

  it('shows an empty state for a vault with no certificates', async () => {
    vi.mocked(listCertificates).mockResolvedValue([]);
    renderWithProviders(<CertificatesList />);
    expect(await screen.findByText('No certificates yet')).toBeInTheDocument();
  });

  it('opens the detail pane for the clicked certificate', async () => {
    vi.mocked(listCertificates).mockResolvedValue([makeCertificate()]);
    renderWithProviders(<CertificatesList />);
    await userEvent.click(await screen.findByText('api-tls'));
    expect(await screen.findByText('def456')).toBeInTheDocument();
  });
});

describe('CertificateDetails', () => {
  it('prompts for a selection when nothing is selected', () => {
    renderWithProviders(<CertificateDetails item={null} onClose={vi.fn()} />);
    expect(screen.getByText('No certificate selected')).toBeInTheDocument();
  });

  it('renders subject, thumbprint and expiry for the selection', () => {
    renderWithProviders(<CertificateDetails item={makeCertificate()} onClose={vi.fn()} />);
    expect(screen.getByText('CN=api.contoso.com')).toBeInTheDocument();
    expect(screen.getByText('AA11BB22CC33')).toBeInTheDocument();
  });

  it('closes from the detail header', async () => {
    const onClose = vi.fn();
    renderWithProviders(<CertificateDetails item={makeCertificate()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
