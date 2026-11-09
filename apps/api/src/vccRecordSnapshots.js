const IDENTITY_FIELDS = [
  'asset_code', 'asset_name', 'asset_type', 'serial_no', 'model', 'brand', 'location',
  'is_group', 'group_nature', 'composite_details', 'parent_id', 'parent_asset_code'
];

export const makeAssetSnapshot = (workOrder) => JSON.stringify(Object.fromEntries(
  [...IDENTITY_FIELDS, 'department', 'department_name_th'].map((key) => [key, workOrder[key] ?? null])
));

export const withAssetSnapshot = (workOrder) => {
  let snapshot = null;
  if (workOrder.asset_snapshot) {
    try {
      const parsed = JSON.parse(workOrder.asset_snapshot);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) snapshot = parsed;
    } catch { /* Legacy or corrupt evidence is labelled, never reconstructed from the current register. */ }
  }
  // Access checks retain the current owning department; historical instrument identity stays frozen.
  const identity = snapshot ? Object.fromEntries(IDENTITY_FIELDS.map((key) => [key, snapshot[key] ?? null])) : {};
  return {
    ...workOrder,
    ...identity,
    asset_snapshot: snapshot,
    is_legacy_without_asset_snapshot: workOrder.status === 'CLOSED' && !snapshot
  };
};
