// Which consent rule applies to the Sponsored (Adsterra) placement for this request, decided from the visitor's
// approximate location as Vercel's edge reports it. Vercel sets these headers itself and overwrites any value a
// browser sends, so a visitor cannot choose their own rule. Nothing about the location is stored or returned.
//
//   'notice' : the ad may load on page load, with a visible notice and a "Turn off" control (opt-out law).
//              United States and its territories: state privacy laws are opt-out regimes; Global Privacy Control is
//              still honored in the browser as a refusal. Canada outside Quebec: PIPEDA accepts implied consent for
//              online advertising that is disclosed at the time and can be turned off easily.
//   'opt_in' : nothing from Adsterra loads until the viewer chooses "Allow sponsored content". Everywhere else,
//              including the EEA, UK and Switzerland (ePrivacy/GDPR), Quebec (Law 25 s. 8.1: off by default), Brazil,
//              and any request whose location is unknown, so an unrecognised case always falls back to asking.
const NOTICE_COUNTRIES = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM']);

function header(headers, name) {
  const value = headers?.[name];
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function sponsoredConsentMode(headers) {
  const country = header(headers, 'x-vercel-ip-country');
  if (NOTICE_COUNTRIES.has(country)) return 'notice';
  if (country === 'CA') {
    const region = header(headers, 'x-vercel-ip-country-region');
    return region && region !== 'QC' ? 'notice' : 'opt_in';
  }
  return 'opt_in';
}

module.exports = { sponsoredConsentMode, NOTICE_COUNTRIES };
