/* ISO 8601 → `2026-08-15T00:00:00.000Z` */
export const getTimestamp = () => {
  return new Date().toISOString();
};
