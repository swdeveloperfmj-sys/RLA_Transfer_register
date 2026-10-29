// Keep existing accounts working after Head Office was renamed to HO.
export const isHeadOffice = location => ['head office', 'ho'].includes(location?.trim().toLowerCase());
