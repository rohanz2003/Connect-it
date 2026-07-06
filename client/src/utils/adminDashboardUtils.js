export const getAudienceLabel = (audience) => {
  switch (audience) {
    case 'active':
      return 'Active users';
    case 'recent':
      return 'Recent signups';
    case 'all':
    default:
      return 'All users';
  }
};

export const getStatusTone = (isHealthy) => (isHealthy ? 'success' : 'danger');

export const buildDashboardHighlights = (stats = {}, health = {}) => {
  const safeStats = stats || {};
  const safeHealth = health || {};
  const online = safeHealth.online || {};
  const statSummary = safeHealth.stats || {};

  return [
    { label: 'Users online', value: online.usersOnline ?? 0, tone: 'success' },
    { label: 'Devices active', value: online.devicesOnline ?? 0, tone: 'success' },
    { label: 'Pending requests', value: statSummary.pendingRequests ?? 0, tone: 'warning' },
    { label: 'Unreplied feedback', value: statSummary.unrepliedFeedback ?? 0, tone: 'danger' },
    { label: 'Messages today', value: safeStats.totalMessages ?? 0, tone: 'info' },
  ];
};
