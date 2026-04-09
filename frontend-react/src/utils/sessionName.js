/**
 * Session display name: optional site/label + type + date.
 * Examples: "Sherwood PM-3/5/2026", "Plant A I&I-3/5/2026", or "PM-3/5/2026" if label empty.
 */
export function formatSessionNameWithLabel(siteLabel, sessionType, dateInput) {
  if (!dateInput) return '';
  const d = new Date(`${dateInput}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const yr = d.getFullYear();
  const typePart = sessionType === 'ii' ? `I&I-${m}/${day}/${yr}` : `PM-${m}/${day}/${yr}`;
  const label = String(siteLabel || '').trim();
  return label ? `${label} ${typePart}` : typePart;
}

/** Duplicate: keep site prefix, bump date (e.g. Sherwood PM-1/1/2026 → Sherwood PM-3/5/2026). */
export function defaultDuplicateSessionName(originalName, dateInput) {
  const iso = dateInput || new Date().toISOString().split('T')[0];
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(originalName || '').trim();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const yr = d.getFullYear();
  const tailPm = `PM-${m}/${day}/${yr}`;
  const tailIi = `I&I-${m}/${day}/${yr}`;
  const s = String(originalName || '').trim();

  const labeled = s.match(/^(.+?)\s+(I&I)-\d{1,2}\/\d{1,2}\/\d{4}$/i);
  if (labeled) return `${labeled[1].trim()} ${tailIi}`;
  const labeledPm = s.match(/^(.+?)\s+(PM)-\d{1,2}\/\d{1,2}\/\d{4}$/i);
  if (labeledPm) return `${labeledPm[1].trim()} ${tailPm}`;

  if (/^I&I-\d{1,2}\/\d{1,2}\/\d{4}$/i.test(s)) return tailIi;
  if (/^PM-\d{1,2}\/\d{1,2}\/\d{4}$/i.test(s)) return tailPm;

  const replaced = s.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/, `${m}/${day}/${yr}`);
  if (replaced !== s) return replaced;
  return `${s}-${m}/${day}/${yr}`;
}
