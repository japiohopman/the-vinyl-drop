import { ListingCardViewModel } from './listingCardViewModel';
import { FormViewModel } from './formViewModel';

export interface DesignSystemViewModel {
  [key: string]: unknown;
  title: string;
  formState: FormViewModel;
  sampleListingCards: ListingCardViewModel[];
}
