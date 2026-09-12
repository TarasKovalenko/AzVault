import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeCertificate } from '../../test/fixtures';
import { CertificateDetails } from './CertificateDetails';

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('CertificateDetails', () => {
  it('prompts for a selection when nothing is selected', () => {
    render(<CertificateDetails item={null} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'No certificate selected' })).toBeInTheDocument();
  });

  it('states the expiry once instead of badging and repeating it', () => {
    render(
      <CertificateDetails item={makeCertificate({ expires: inDays(12) })} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/This certificate expires in \d+ days/)).toBeInTheDocument();
    expect(screen.queryByText(/Expires in \d+d/)).not.toBeInTheDocument();
  });

  it('still badges an expired certificate', () => {
    render(
      <CertificateDetails
        item={makeCertificate({ expires: '2000-01-01T00:00:00Z', enabled: false })}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('copies the thumbprint and writes tags the way the lists do', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(
      <CertificateDetails item={makeCertificate({ tags: { env: 'prod' } })} onClose={vi.fn()} />,
    );
    await userEvent.click(screen.getByTitle('Copy thumbprint'));
    expect(writeText).toHaveBeenCalledWith('AABBCC');
    expect(screen.getByTitle('Copied')).toBeInTheDocument();
    expect(screen.getByText('env=prod')).toBeInTheDocument();
  });

  it('closes and copes with missing fields', async () => {
    const onClose = vi.fn();
    render(
      <CertificateDetails
        item={makeCertificate({
          id: 'no-version-here',
          subject: null,
          thumbprint: null,
          created: null,
          updated: null,
          notBefore: null,
        })}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('Not before')).toBeInTheDocument();
    expect(screen.queryByTitle('Copy thumbprint')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
