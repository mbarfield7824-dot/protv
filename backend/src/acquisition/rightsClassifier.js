// Practical, evidence-based public-domain triage. This is NOT legal advice: it sorts
// candidates so an administrator can approve obvious cases quickly and review the rest.
const CLASSIFICATIONS = ['likely-pd', 'needs-review', 'not-cleared'];
const CLASSIFICATION_LABELS = {
  'likely-pd': 'Likely PD',
  'needs-review': 'Needs Review',
  'not-cleared': 'Not Cleared',
};
const PD_LICENSE_PATHS = ['/publicdomain/zero/', '/publicdomain/mark/', '/licenses/publicdomain'];
// U.S. works published more than 95 years ago are public domain (1931 films in 2027, etc.).
function publicDomainCutoffYear(now = new Date()) {
  return now.getUTCFullYear() - 96;
}

function text(value) {
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string').join(' ');
  return typeof value === 'string' ? value : '';
}

const RESTORATION = /\b(?:restor(?:ed|ation)|colou?ri[sz]ed|remaster(?:ed)?|re-?scored|new\s+score|newly\s+composed|music\s+by|score\s+by|digitally\s+(?:enhanced|restored)|criterion|kino\s+lorber|blu-?ray\s+release)\b/i;
const NEGATED = /\b(?:not|no longer|isn'?t|is not)\s+(?:in\s+the\s+)?public\s+domain\b/i;
const RESERVED = /\b(?:all\s+rights\s+reserved|copyright(?:ed)?\s+(?:by|\u00a9)|\u00a9\s*\d{4})/i;
const PD_WORDS = /\bpublic\s+domain\b|\bcc0\b|\bno\s+known\s+copyright\b/i;

function parseLicense(licenseUrl) {
  const url = String(licenseUrl || '').toLowerCase();
  if (!url) return { kind: 'none' };
  if (PD_LICENSE_PATHS.some((part) => url.includes(part))) {
    return { kind: 'pd', label: url.includes('/zero/') ? 'CC0 dedication' : 'Public Domain Mark / dedication' };
  }
  const match = url.match(/creativecommons\.org\/licenses\/([a-z-]+)/);
  if (match) {
    const terms = match[1];
    return { kind: /nc|nd/.test(terms) ? 'restricted' : 'attribution', label: `CC ${terms.toUpperCase()}` };
  }
  return { kind: 'other', label: url };
}

function classifyRights({
  title = '',
  year = null,
  licenseUrl = '',
  rights = '',
  description = '',
  subjects = [],
  source = '',
  referenceOnly = false,
  now = new Date(),
} = {}) {
  const cutoff = publicDomainCutoffYear(now);
  const license = parseLicense(licenseUrl);
  const rightsText = text(rights);
  const descriptionText = text(description);
  const claimText = `${rightsText} ${descriptionText} ${text(subjects)}`;
  const numericYear = Number(year);
  const knownYear = Number.isInteger(numericYear) && numericYear >= 1850 && numericYear <= 2100;
  const concerns = [];
  const evidenceUrls = [];
  if (licenseUrl) evidenceUrls.push(String(licenseUrl));
  const sourceClaimsPd = license.kind === 'pd' || PD_WORDS.test(rightsText) || PD_WORDS.test(descriptionText);
  const restoration = RESTORATION.test(`${title} ${descriptionText}`);

  const result = (classification, basis, extra = {}) => ({
    classification,
    label: CLASSIFICATION_LABELS[classification],
    basis,
    concerns,
    evidenceUrls,
    sourceClaimsPublicDomain: sourceClaimsPd,
    year: knownYear ? numericYear : null,
    cutoffYear: cutoff,
    source,
    ...extra,
  });

  if (license.kind === 'restricted') {
    concerns.push(`${license.label} license restricts commercial or derivative use.`);
    return result('not-cleared', 'Source applies a restrictive license, which is incompatible with commercial streaming.');
  }
  if (NEGATED.test(claimText) || (RESERVED.test(rightsText) && !sourceClaimsPd)) {
    concerns.push('Source text asserts copyright or states the work is not public domain.');
    return result('not-cleared', 'Source indicates the work is still under copyright.');
  }
  if (referenceOnly) {
    concerns.push('Reference-only source: no downloadable video is ingested from it.');
    return result('needs-review', 'Reference-only source; verify rights on a downloadable copy before use.');
  }
  if (license.kind === 'attribution') {
    concerns.push(`${license.label} requires attribution and is not a public-domain dedication.`);
    return result('needs-review', 'Licensed (not public domain); attribution terms must be satisfied.');
  }
  if (restoration) {
    concerns.push('Restoration, colorization, new score or similar markers: the copy may carry separate rights even if the film itself is PD.');
  }

  if (knownYear && numericYear <= cutoff) {
    const basis = `Published ${numericYear}, on or before ${cutoff}: generally public domain in the U.S. (film rights).`;
    if (restoration) return result('needs-review', `${basis} Copy-specific rights (restoration/score) need a quick check.`, { filmLikelyPd: true });
    if (!sourceClaimsPd) concerns.push('Source gives no explicit public-domain statement; relying on the publication date.');
    return result('likely-pd', basis, { filmLikelyPd: true });
  }
  if (knownYear) {
    if (sourceClaimsPd) {
      concerns.push(`Published ${numericYear}, after the ${cutoff} cutoff: the source label alone does not establish rights. Check lapsed notice/renewal.`);
      return result('needs-review', 'Source labels it public domain, but the age alone does not clear it.');
    }
    concerns.push(`Published ${numericYear}, after the ${cutoff} cutoff, with no public-domain statement.`);
    return result('not-cleared', 'Too recent to assume public domain and no supporting statement.');
  }
  if (sourceClaimsPd) {
    concerns.push('Release year is unknown, so age cannot be verified.');
    return result('needs-review', 'Source claims public domain but no release year was supplied.');
  }
  concerns.push('No release year and no public-domain statement.');
  return result('not-cleared', 'No evidence to support public-domain status.');
}

function classifyCandidateRights(candidate = {}) {
  const evidence = candidate.licenseEvidence || {};
  if (evidence.classification && CLASSIFICATIONS.includes(evidence.classification)) {
    return {
      classification: evidence.classification,
      label: CLASSIFICATION_LABELS[evidence.classification],
      basis: evidence.basis || evidence.label || '',
      concerns: evidence.concerns || [],
      evidenceUrls: evidence.evidenceUrls || (evidence.url ? [evidence.url] : []),
      year: evidence.year ?? null,
    };
  }
  return classifyRights({
    title: candidate.title,
    year: candidate.year,
    licenseUrl: evidence.url || candidate.licenseUrl,
    rights: [evidence.eligible ? evidence.label : '', candidate.rights].filter(Boolean).join(' '),
    description: candidate.description,
    subjects: candidate.subjects,
    source: candidate.source,
    referenceOnly: candidate.ingestionAvailable === false,
  });
}

module.exports = {
  CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  classifyCandidateRights,
  classifyRights,
  publicDomainCutoffYear,
};
