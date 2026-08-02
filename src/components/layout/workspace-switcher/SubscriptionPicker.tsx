import type { Subscription } from '../../../types';
import { WorkspaceSelect } from './WorkspaceSelect';

export function SubscriptionPicker({
  subscriptions,
  selectedSubscriptionId,
  isLoading,
  onSelect,
}: {
  subscriptions: Subscription[];
  selectedSubscriptionId: string | null;
  isLoading: boolean;
  onSelect: (subscriptionId: string) => void;
}) {
  const current = subscriptions.find(
    (subscription) => subscription.subscriptionId === selectedSubscriptionId,
  );
  return (
    <>
      <span className="text-[var(--text-tertiary)]">/</span>
      <WorkspaceSelect
        icon="subscription"
        isLoading={isLoading}
        aria-label="Subscription"
        title={`Subscription: ${current?.displayName || 'none selected'}`}
        value={selectedSubscriptionId || ''}
        onChange={(event) => onSelect(event.target.value)}
        disabled={subscriptions.length === 0}
        className="max-w-40"
      >
        {!selectedSubscriptionId && <option value="">Subscription</option>}
        {subscriptions.map((subscription) => (
          <option key={subscription.subscriptionId} value={subscription.subscriptionId}>
            {subscription.displayName}
          </option>
        ))}
        {subscriptions.length === 0 && <option>Select a tenant first</option>}
      </WorkspaceSelect>
    </>
  );
}
