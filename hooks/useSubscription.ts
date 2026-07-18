import { useAuth } from '@/lib/auth';
import { SubscriptionTier } from '@/types';

interface UseSubscriptionReturn {
  tier: SubscriptionTier;
  isPremium: boolean;
  isFree: boolean;
  isLoading: boolean;
}

export function useSubscription(): UseSubscriptionReturn {
  const { profile, isLoading } = useAuth();

  const tier: SubscriptionTier = profile?.subscription_tier ?? 'free';

  return {
    tier,
    isPremium: tier === 'premium',
    isFree: tier === 'free',
    isLoading,
  };
}
