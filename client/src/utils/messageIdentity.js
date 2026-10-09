// Optional IDs must be present on both sides; undefined === undefined is not
// evidence that two messages match (especially for delivery/read receipts).
export const isSameMessage = (a, b) => {
  if (!a || !b) return false;
  if (a._id && b._id && String(a._id) === String(b._id)) return true;
  return Boolean(a.tempId && b.tempId && a.tempId === b.tempId);
};
