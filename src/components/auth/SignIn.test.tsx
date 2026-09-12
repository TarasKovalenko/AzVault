import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as tauri from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { useMockStore } from '../../stores/mockStore';
import { SignIn } from './SignIn';

vi.mock('../../services/tauri', () => ({ authStatus: vi.fn() }));

const initialState = useAppStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(initialState, true);
  useMockStore.setState({ mockMode: false, mockAvailable: false });
  vi.mocked(tauri.authStatus).mockResolvedValue({
    signed_in: false,
    user_name: null,
    tenant_id: null,
  });
});

describe('SignIn', () => {
  it('checks the CLI session on mount', async () => {
    render(<SignIn />);
    expect(screen.getByText('Checking Azure CLI session…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Azure CLI detected')).toBeInTheDocument());
    expect(screen.getByText('No active session')).toBeInTheDocument();
  });

  it('signs in automatically when the CLI already has a session', async () => {
    vi.mocked(tauri.authStatus).mockResolvedValue({
      signed_in: true,
      user_name: 'ada@contoso.com',
      tenant_id: 'tenant-1',
    });
    render(<SignIn />);
    await waitFor(() => expect(useAppStore.getState().isSignedIn).toBe(true));
    expect(useAppStore.getState().userName).toBe('ada@contoso.com');
    expect(screen.getByText('Signed in as ada@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('Tenant tenant-1')).toBeInTheDocument();
  });

  it('names an anonymous CLI session generically', async () => {
    vi.mocked(tauri.authStatus).mockResolvedValue({
      signed_in: true,
      user_name: null,
      tenant_id: null,
    });
    render(<SignIn />);
    await waitFor(() => expect(useAppStore.getState().userName).toBe('Azure CLI User'));
  });

  it('reports a missing Azure CLI', async () => {
    vi.mocked(tauri.authStatus).mockRejectedValue(new Error('command not found'));
    render(<SignIn />);
    await waitFor(() => expect(screen.getByText('Azure CLI not found')).toBeInTheDocument());
  });

  it('explains a retry that still finds no session', async () => {
    render(<SignIn />);
    await waitFor(() => expect(screen.getByText('Azure CLI detected')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Connect with Azure CLI/ }));
    await waitFor(() =>
      expect(
        screen.getByText("Azure CLI session not found. Run 'az login' and retry."),
      ).toBeInTheDocument(),
    );
  });

  it('surfaces a failing retry', async () => {
    render(<SignIn />);
    await waitFor(() => expect(screen.getByText('Azure CLI detected')).toBeInTheDocument());
    vi.mocked(tauri.authStatus).mockRejectedValue(new Error('socket closed'));
    await userEvent.click(screen.getByRole('button', { name: /Connect with Azure CLI/ }));
    await waitFor(() => expect(screen.getByText('Connection failed')).toBeInTheDocument());
    expect(screen.getByText(/socket closed/)).toBeInTheDocument();
  });

  it('copies the suggested commands', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<SignIn />);
    await waitFor(() => expect(screen.getByText('Azure CLI detected')).toBeInTheDocument());
    const [login, accountSet] = screen.getAllByRole('button', { name: 'Copy command' });
    await userEvent.click(login);
    expect(writeText).toHaveBeenCalledWith('az login');
    await userEvent.click(accountSet);
    expect(writeText).toHaveBeenCalledWith('az account set --subscription ');
  });

  it('hides the mock-mode controls unless the build allows them', async () => {
    render(<SignIn />);
    await waitFor(() => expect(screen.getByText('Azure CLI detected')).toBeInTheDocument());
    expect(screen.queryByText(/Mock Mode/)).not.toBeInTheDocument();
  });

  it('offers a mock session when the build allows it', async () => {
    useMockStore.setState({ mockAvailable: true, mockMode: true });
    render(<SignIn />);
    await waitFor(() => expect(screen.getByText('Mock Mode On')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Continue with Mock Data/ }));
    expect(useAppStore.getState().userName).toBe('demo@contoso.com');
  });
});
