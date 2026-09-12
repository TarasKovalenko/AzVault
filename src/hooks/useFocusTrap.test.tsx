import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { getFocusable, useFocusTrap } from './useFocusTrap';

function Trapped({ active = true, withAutoFocus = false }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div ref={ref} tabIndex={-1}>
      <button type="button">close</button>
      {/* biome-ignore lint/a11y/noAutofocus: mirrors the confirmation dialogs under test */}
      <input aria-label="confirm" autoFocus={withAutoFocus} />
      <button type="button">submit</button>
    </div>
  );
}

function Harness({ withAutoFocus = false }) {
  return (
    <>
      <button type="button">outside trigger</button>
      <Trapped withAutoFocus={withAutoFocus} />
    </>
  );
}

describe('getFocusable', () => {
  it('lists focusable descendants in document order and skips disabled and hidden ones', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button id="a"></button>
      <button id="b" disabled></button>
      <input id="c" />
      <input id="d" style="display: none" />
      <div id="e" tabindex="0"></div>
      <div id="f" tabindex="-1"></div>
      <span id="g"></span>
      <button id="h" hidden></button>
      <button id="i" aria-hidden="true"></button>
    `;
    expect(getFocusable(container).map((element) => element.id)).toEqual(['a', 'c', 'e']);
  });
});

describe('useFocusTrap', () => {
  it('focuses the first focusable element when the overlay opens', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'close' })).toHaveFocus();
  });

  it('leaves an autoFocused field alone instead of stealing focus to the close button', () => {
    render(<Harness withAutoFocus />);
    // The confirmation input keeps focus, so typing goes where the user expects.
    expect(screen.getByLabelText('confirm')).toHaveFocus();
  });

  it('cycles Tab from the last element back to the first', async () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'submit' }).focus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'close' })).toHaveFocus();
  });

  it('cycles Shift+Tab from the first element to the last', async () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'close' }).focus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'submit' })).toHaveFocus();
  });

  it('returns focus to whatever was focused before, once the overlay closes', () => {
    const { rerender } = render(
      <>
        <button type="button">outside trigger</button>
        <Trapped active={false} />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'outside trigger' });
    trigger.focus();

    rerender(
      <>
        <button type="button">outside trigger</button>
        <Trapped active />
      </>,
    );
    expect(screen.getByRole('button', { name: 'close' })).toHaveFocus();

    rerender(
      <>
        <button type="button">outside trigger</button>
        <Trapped active={false} />
      </>,
    );
    expect(trigger).toHaveFocus();
  });
});
