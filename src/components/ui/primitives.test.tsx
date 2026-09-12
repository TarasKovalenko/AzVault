import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { Button, Spinner } from './Button';
import { cn } from './cn';
import { Dropdown, DropdownItem } from './Dropdown';
import { Field, Input, Select, Switch, Textarea } from './Field';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { ToastProvider, useToast } from './Toast';

describe('cn', () => {
  it('joins truthy class names only', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
    expect(cn()).toBe('');
  });
});

describe('Button', () => {
  it('renders a non-submitting button that fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a spinner instead of the icon while loading and stays disabled', () => {
    render(
      <Button loading icon={<span data-testid="icon" />}>
        Save
      </Button>,
    );
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('gives each variant its own surface and each size its own height', () => {
    render(
      <>
        <Button variant="primary">primary</Button>
        <Button variant="secondary">secondary</Button>
        <Button variant="ghost">ghost</Button>
        <Button variant="danger">danger</Button>
      </>,
    );

    const classOf = (name: string) => screen.getByRole('button', { name }).className;
    expect(classOf('primary')).toContain('bg-[var(--accent)]');
    expect(classOf('secondary')).toContain('bg-[var(--surface-raised)]');
    expect(classOf('ghost')).toContain('bg-transparent');
    expect(classOf('danger')).toContain('bg-[var(--danger)]');

    // Every variant must be visually distinct from every other one.
    const classNames = ['primary', 'secondary', 'ghost', 'danger'].map(classOf);
    expect(new Set(classNames).size).toBe(4);
  });

  it('sizes buttons distinctly and defaults to sm/secondary', () => {
    render(
      <>
        <Button size="xs">xs</Button>
        <Button size="sm">sm</Button>
        <Button size="md">md</Button>
        <Button>default</Button>
      </>,
    );

    const classOf = (name: string) => screen.getByRole('button', { name }).className;
    expect(classOf('xs')).toContain('h-7');
    expect(classOf('sm')).toContain('h-8');
    expect(classOf('md')).toContain('h-9');
    // An unspecified button is the secondary/sm one used across the toolbars.
    expect(classOf('default')).toContain('h-8');
    expect(classOf('default')).toContain('bg-[var(--surface-raised)]');
  });

  it('renders spinners at distinct sizes', () => {
    render(
      <>
        <Spinner size="sm" className="spinner-sm" />
        <Spinner className="spinner-default" />
        <Spinner size="lg" className="spinner-lg" />
      </>,
    );

    const [small, medium, large] = screen.getAllByLabelText('Loading');
    expect(small.className).toContain('size-3.5');
    expect(medium.className).toContain('size-4');
    expect(large.className).toContain('size-6');
  });
});

describe('Badge', () => {
  it('paints a different colour for every tone and defaults to neutral', () => {
    render(
      <>
        <Badge>none</Badge>
        <Badge tone="neutral">neutral</Badge>
        <Badge tone="blue">blue</Badge>
        <Badge tone="green">green</Badge>
        <Badge tone="orange">orange</Badge>
        <Badge tone="red">red</Badge>
        <Badge tone="purple">purple</Badge>
      </>,
    );

    const classOf = (text: string) => screen.getByText(text).className;
    expect(classOf('neutral')).toContain('bg-[var(--surface-muted)]');
    expect(classOf('blue')).toContain('bg-blue-500/12');
    expect(classOf('green')).toContain('bg-green-500/12');
    expect(classOf('orange')).toContain('bg-orange-500/12');
    expect(classOf('red')).toContain('bg-red-500/12');
    expect(classOf('purple')).toContain('bg-purple-500/12');

    // An omitted tone is neutral, not the first entry of the tone map.
    expect(classOf('none')).toBe(classOf('neutral'));

    const tones = ['neutral', 'blue', 'green', 'orange', 'red', 'purple'].map(classOf);
    expect(new Set(tones).size).toBe(6);
  });
});

describe('Icon', () => {
  it('renders an SVG at the requested size', () => {
    const { container } = render(<Icon name="lock" size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Field controls', () => {
  it('shows the label and the hint', () => {
    render(
      <Field label="Name" hint="Letters only">
        <Input />
      </Field>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Letters only')).toBeInTheDocument();
  });

  it('prefers the error over the hint', () => {
    render(
      <Field label="Name" hint="Letters only" error="Name is required.">
        <Input />
      </Field>,
    );
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(screen.queryByText('Letters only')).not.toBeInTheDocument();
  });

  it('renders input, textarea and select controls', async () => {
    render(
      <>
        <Input aria-label="text" />
        <Textarea aria-label="notes" />
        <Select aria-label="choice" defaultValue="b">
          <option value="a">A</option>
          <option value="b">B</option>
        </Select>
      </>,
    );
    await userEvent.type(screen.getByLabelText('text'), 'hello');
    expect(screen.getByLabelText('text')).toHaveValue('hello');
    await userEvent.type(screen.getByLabelText('notes'), 'note');
    expect(screen.getByLabelText('notes')).toHaveValue('note');
    await userEvent.selectOptions(screen.getByLabelText('choice'), 'a');
    expect(screen.getByLabelText('choice')).toHaveValue('a');
  });
});

describe('Switch', () => {
  it('reports its state and toggles on click', async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Switch checked={on} onChange={setOn} label="Enabled" />;
    }
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Enabled' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('does not toggle while disabled', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} disabled label="Enabled" />);
    await userEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Settings">
        body
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title, description, body and footer', () => {
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="Settings"
        description="Tune the app"
        size="lg"
        footer={<button type="button">Done</button>}
      >
        body
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Tune the app')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('closes on Escape, on the close button and on a backdrop click', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose} title="Settings" size="sm">
        body
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);

    // Clicking inside the dialog must not close it.
    await userEvent.click(screen.getByText('body'));
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(
      <Modal open={false} onClose={onClose} title="Settings">
        body
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('ignores Escape, the backdrop and the close button when closing is disabled', async () => {
    const onClose = vi.fn();
    render(
      <Modal open closeDisabled onClose={onClose} title="Busy">
        body
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Dropdown', () => {
  const renderDropdown = (onPick = vi.fn()) => {
    render(
      <Dropdown align="end" trigger={<button type="button">Open menu</button>}>
        <DropdownItem onClick={onPick}>Export</DropdownItem>
        <DropdownItem disabled onClick={onPick}>
          Disabled
        </DropdownItem>
      </Dropdown>,
    );
    return onPick;
  };

  it('opens and closes on the trigger and reports expansion', async () => {
    renderDropdown();
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('runs the item handler and then closes', async () => {
    const onPick = renderDropdown();
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
    expect(onPick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('ignores disabled items', async () => {
    const onPick = renderDropdown();
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Disabled' }));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes on an outside click and on Escape', async () => {
    renderDropdown();
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    await userEvent.click(trigger);
    await userEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('renders a non-element trigger untouched', () => {
    render(
      <Dropdown trigger={'plain' as unknown as React.ReactElement}>
        <DropdownItem>Item</DropdownItem>
      </Dropdown>,
    );
    expect(screen.getByText('plain')).toBeInTheDocument();
  });

  it("keeps the trigger's own onClick instead of replacing it", async () => {
    const triggerClick = vi.fn();
    render(
      <Dropdown
        trigger={
          <button type="button" onClick={triggerClick}>
            Open menu
          </button>
        }
      >
        <DropdownItem>Export</DropdownItem>
      </Dropdown>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(triggerClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('moves focus into the menu and rolls it with the arrow keys, Home and End', async () => {
    render(
      <Dropdown trigger={<button type="button">Open menu</button>}>
        <DropdownItem>First</DropdownItem>
        <DropdownItem disabled>Skipped</DropdownItem>
        <DropdownItem>Second</DropdownItem>
        <DropdownItem>Third</DropdownItem>
      </Dropdown>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const item = (name: string) => screen.getByRole('menuitem', { name });
    await waitFor(() => expect(item('First')).toHaveFocus());

    await userEvent.keyboard('{ArrowDown}');
    // Disabled items are skipped: they are not part of the focus ring.
    expect(item('Second')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(item('First')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(item('Third')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(item('First')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(item('Third')).toHaveFocus();
  });

  it('returns focus to the trigger when it closes on Escape or on a choice', async () => {
    const onPick = renderDropdown();
    const trigger = screen.getByRole('button', { name: 'Open menu' });

    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});

describe('Toast', () => {
  function Harness() {
    const toast = useToast();
    return (
      <>
        <button type="button" onClick={() => toast.success('Saved', 'All good')}>
          success
        </button>
        <button type="button" onClick={() => toast.error('Failed')}>
          error
        </button>
        <button type="button" onClick={() => toast.warning('Careful')}>
          warning
        </button>
        <button type="button" onClick={() => toast.info('Heads up')}>
          info
        </button>
      </>
    );
  }

  it('announces politely, alerts on errors and auto-dismisses everything but errors', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    for (const tone of ['success', 'error', 'warning', 'info']) {
      fireEvent.click(screen.getByRole('button', { name: tone }));
    }
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.getByText('Careful')).toBeInTheDocument();
    expect(screen.getByText('Heads up')).toBeInTheDocument();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Failed');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    const polite = screen.getAllByRole('status');
    expect(polite).toHaveLength(3);
    for (const toast of polite) expect(toast).toHaveAttribute('aria-live', 'polite');

    await vi.advanceTimersByTimeAsync(4100);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.queryByText('Heads up')).not.toBeInTheDocument();
    expect(screen.queryByText('Careful')).not.toBeInTheDocument();
    // An error a user still has to read must not disappear on a timer.
    expect(screen.getByText('Failed')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('dismisses any toast from its close button', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    fireEvent.click(screen.getByRole('button', { name: 'success' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Failed' }));
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Saved' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('refuses to work outside its provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Harness />)).toThrow('useToast must be used within ToastProvider');
    spy.mockRestore();
  });
});
