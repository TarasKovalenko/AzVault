import azvaultIcon from '../../assets/azvault-icon.png';
import { CommandPaletteTrigger } from './top-bar/CommandPaletteTrigger';
import { TopBarActions } from './top-bar/TopBarActions';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function TopBar() {
  return (
    <header className="mac-vibrancy drag-region flex h-[54px] shrink-0 items-center gap-3 border-b border-[var(--stroke)] px-3">
      <div className="no-drag flex items-center gap-2 pl-1">
        <img src={azvaultIcon} alt="" className="size-7 shrink-0 object-contain" />
        <span className="text-[13px] font-semibold tracking-tight">AzVault</span>
      </div>
      <div className="no-drag min-w-0">
        <WorkspaceSwitcher />
      </div>
      <CommandPaletteTrigger />
      <TopBarActions />
    </header>
  );
}
