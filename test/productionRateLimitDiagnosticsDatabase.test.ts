jest.mock('../src/db', () => ({
  queryClient: {
    begin: jest.fn(),
  },
}));

import { checkRateLimitTableAccess } from '../src/app/controllers/productionRateLimitDiagnosticsController';

const { queryClient } = jest.requireMock('../src/db') as {
  queryClient: { begin: jest.Mock };
};
const mockUnsafe = jest.fn();

describe('production rate-limit database probe', () => {
  beforeEach(() => {
    mockUnsafe.mockReset().mockResolvedValue([]);
    queryClient.begin.mockReset().mockImplementation(
      (callback: (sql: { unsafe: jest.Mock }) => Promise<unknown>) =>
        callback({ unsafe: mockUnsafe })
    );
  });

  it('runs the bounded zero-row private-table access query in one transaction', async () => {
    await expect(checkRateLimitTableAccess()).resolves.toBeUndefined();

    expect(queryClient.begin).toHaveBeenCalledTimes(1);
    expect(mockUnsafe.mock.calls).toEqual([
      ["SET LOCAL statement_timeout = '3s'"],
      ['SELECT 1 FROM private.rate_limit_buckets LIMIT 0'],
    ]);
  });

  it('propagates a failed table-access query so the handler can return 503', async () => {
    const permissionError = new Error('permission denied');
    mockUnsafe
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(permissionError);

    await expect(checkRateLimitTableAccess()).rejects.toBe(permissionError);
  });
});
