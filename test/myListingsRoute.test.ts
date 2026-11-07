import type { NextFunction, Request, Response } from 'express';
import { getMyListings } from '../src/app/services/listingService';
import { renderWithLayout } from '../src/app/utils/render';
import { getSellerListings } from '../src/app/controllers/listingController';

jest.mock('../src/app/services/listingService', () => ({
  getMyListings: jest.fn(),
}));

jest.mock('../src/app/utils/render', () => ({
  renderWithLayout: jest.fn(),
}));

const getMyListingsMock = getMyListings as jest.MockedFunction<typeof getMyListings>;
const renderWithLayoutMock = renderWithLayout as jest.Mock;

describe('My Listings controller uses the batched read model (#380)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests the hidden view through the service and renders its unchanged view contract', async () => {
    const items = [{ id: 'listing-hidden', status: 'sold' }] as never;
    getMyListingsMock.mockResolvedValue(items);

    const req = {
      user: { id: 'seller-123' },
      query: { view: 'hidden' },
    } as unknown as Request;
    const res = { redirect: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await getSellerListings(req, res, next);

    expect(getMyListingsMock).toHaveBeenCalledTimes(1);
    expect(getMyListingsMock).toHaveBeenCalledWith('seller-123', true);
    expect(renderWithLayoutMock).toHaveBeenCalledWith(res, 'listings/index', {
      title: 'My Listings - The Vinyl Drop',
      listings: items,
      viewHidden: true,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('defaults to the visible view and redirects unauthenticated requests without querying listings', async () => {
    getMyListingsMock.mockResolvedValue([]);

    const req = {
      user: { id: 'seller-456' },
      query: {},
    } as unknown as Request;
    const res = { redirect: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await getSellerListings(req, res, next);

    expect(getMyListingsMock).toHaveBeenCalledWith('seller-456', false);
    expect(renderWithLayoutMock).toHaveBeenCalledWith(res, 'listings/index', {
      title: 'My Listings - The Vinyl Drop',
      listings: [],
      viewHidden: false,
    });

    getMyListingsMock.mockClear();
    const anonymousReq = { user: undefined, query: {} } as unknown as Request;
    await getSellerListings(anonymousReq, res, next);
    expect(res.redirect).toHaveBeenCalledWith('/auth/login');
    expect(getMyListingsMock).not.toHaveBeenCalled();
  });
});
