// Creator agreements reviewed for PROtv LIVE (scheduled linear streaming), 2026-11-12. These findings pre-fill the
// Linear rights form; they never record a decision. Only an Administrator's recorded decision lets a title air.
// Adding a title here is a reviewed code change, like the Roku and Fire TV clearance lists.
const REVIEWED_AGREEMENTS = {
  // Signed STD6040-v1 "Non-Exclusive Film Distribution and Streaming License", Document ID below.
  'creator_5a913abe-bbb5-44a5-9c8f-cc12b7496ba9': {
    finding: 'supports',
    agreementReference: '3e9c05e3-55d4-463a-9d60-8da0622adab9 (STD6040-v1, revision 4)',
    territory: 'Worldwide',
    // Term: 24 months from the Effective Date (signed 2026-11-11T02:38Z, i.e. 10 Nov ET). Ends a day early to stay inside it.
    expiresOn: '2028-11-09',
    basis: 'Signed STD6040-v1 agreement: §2.1 grants PROtv a non-exclusive licence "to host, store, encode, transcode, format and stream the Film to viewers through the PROtv Services"; Schedule 2 lists "the watchprotv.com website" and the PROtv apps; no on-demand-only limitation. §5.1 permits advertising "before, during and after the Film" at natural breaks without altering its content. §2.2: the Film must not be cut or altered, so PROtv LIVE must air it complete (no segment splitting). Term 24 months; Territory worldwide.',
    caution: 'The grant is format-neutral streaming on watchprotv.com. It does not name scheduled linear streaming, so the Owner confirms that reading before recording it.',
  },
};

// What the record shows for titles whose signed wording was not available to review.
function agreementFinding(video) {
  const reviewed = REVIEWED_AGREEMENTS[video.id];
  if (reviewed) return reviewed;
  const license = String(video.licenseType || '');
  if (video.creatorContractReference) {
    return {
      finding: 'not-reviewed',
      caution: `Signed ${license || 'creator agreement'} (${video.creatorContractReference}) is held in the Creator Portal; its wording was not available to PROtv for this review. Read the signed Schedule before deciding.${video.rokuCleared === true || video.rokuCleared === 'true' ? ' Its Schedule names TV apps (Roku clearance), which says where it may stream, not whether a scheduled channel is allowed.' : ''}`,
    };
  }
  if (video.copyrightStatus === 'public-domain') {
    return { finding: 'no-agreement', caution: 'Public-domain basis, no licensor agreement. Linear use stands or falls with the same public-domain evidence; check the open items before deciding.' };
  }
  if (/^CC BY/i.test(license)) {
    return { finding: 'no-agreement', caution: `${license} permits any distribution with attribution. Airing it requires showing the credit; confirm the attribution text before deciding.` };
  }
  return { finding: 'none', caution: 'No agreement or licence on record that addresses scheduled linear streaming.' };
}

module.exports = { REVIEWED_AGREEMENTS, agreementFinding };
