import { getAudienceLabel, getStatusTone, buildDashboardHighlights } from './adminDashboardUtils';

describe('admin dashboard helpers', () => {
  it('returns a friendly label for each audience', () => {
    expect(getAudienceLabel('all')).toBe('All users');
    expect(getAudienceLabel('active')).toBe('Active users');
    expect(getAudienceLabel('recent')).toBe('Recent signups');
  });

  it('maps health values to the correct tone', () => {
    expect(getStatusTone(true)).toBe('success');
    expect(getStatusTone(false)).toBe('danger');
  });

  it('builds highlights from stats and health data', () => {
    const highlights = buildDashboardHighlights({ totalUsers: 120, totalMessages: 3400, totalFeedback: 54 }, {
      online: { usersOnline: 24, devicesOnline: 31 },
      stats: { pendingRequests: 7, unrepliedFeedback: 2 },
    });

    expect(highlights[0].label).toBe('Users online');
    expect(highlights[2].value).toBe(7);
  });
});
