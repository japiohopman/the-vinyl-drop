import { Request, Response, NextFunction } from 'express';
import {
  demoListingFormSchema,
  formatZodFormErrors,
  FormViewModel,
} from '../view-models/formViewModel';
import { buildListingCardViewModel } from '../view-models/listingCardViewModel';
import { renderWithLayout } from '../utils/render';

const sampleListingCards = [
  buildListingCardViewModel({
    id: 'ds-card-1',
    title: 'Kind of Blue',
    artist: 'Miles Davis',
    releaseYear: 1959,
    format: '180g Vinyl LP',
    priceMinorUnits: 3200,
    isTrade: false,
    mediaCondition: 'NM',
    sleeveCondition: 'VG+',
    imageUrl: 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?auto=format&fit=crop&w=600&q=80',
    sellerUsername: 'miles_ahead',
    sellerLocation: 'Dublin 8',
  }),
  buildListingCardViewModel({
    id: 'ds-card-2',
    title: 'Illmatic',
    artist: 'Nas',
    releaseYear: 1994,
    format: '12" Vinyl',
    priceMinorUnits: null,
    isTrade: true,
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
    imageUrl: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=600&q=80',
    sellerUsername: 'queensbridge_wax',
    sellerLocation: 'Galway',
  }),
];

function getDefaultFormState(): FormViewModel {
  return {
    values: {
      title: '',
      artist: '',
      price: '',
      mediaCondition: 'VG+',
      description: '',
      acceptTerms: '',
    },
    fieldErrors: {},
    generalErrors: [],
    isSubmitted: false,
  };
}

export function getDesignSystemPage(req: Request, res: Response, next: NextFunction): void {
  try {
    const viewModel = {
      title: 'Design System Primitives',
      formState: getDefaultFormState(),
      sampleListingCards,
    };
    renderWithLayout(res, 'design-system/index', viewModel);
  } catch (error) {
    next(error);
  }
}

export function postDesignSystemDemo(req: Request, res: Response, next: NextFunction): void {
  try {
    const body = req.body || {};
    const parseResult = demoListingFormSchema.safeParse(body);

    if (!parseResult.success) {
      const formState = formatZodFormErrors(parseResult.error, {
        title: String(body.title || ''),
        artist: String(body.artist || ''),
        price: String(body.price || ''),
        mediaCondition: String(body.mediaCondition || ''),
        description: String(body.description || ''),
        acceptTerms: String(body.acceptTerms || ''),
      });

      res.status(400);
      return renderWithLayout(res, 'design-system/index', {
        title: 'Design System Primitives',
        formState,
        sampleListingCards,
      });
    }

    // Success state demo
    const formState: FormViewModel = {
      values: parseResult.data,
      fieldErrors: {},
      generalErrors: [],
      isSubmitted: true,
      isSuccess: true,
      successMessage: 'Listing form validated successfully! All fields conform to Zod schema.',
    };

    res.status(200);
    return renderWithLayout(res, 'design-system/index', {
      title: 'Design System Primitives',
      formState,
      sampleListingCards,
    });
  } catch (error) {
    next(error);
  }
}
