import { ListingCardViewModel } from './listingCardViewModel';

export interface HomeViewModel {
  [key: string]: unknown;
  title: string;
  message: string;
  recentDrops?: ListingCardViewModel[];
}

export function buildHomeViewModel(
  welcomeMessage: string,
  recentDrops: ListingCardViewModel[] = []
): HomeViewModel {
  return {
    title: 'Home',
    message: welcomeMessage,
    recentDrops,
  };
}
