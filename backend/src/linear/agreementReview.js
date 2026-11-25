// Creator agreements reviewed for PROtv LIVE (scheduled linear streaming), 2026-11-12 and 2026-11-21. These findings pre-fill the
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
  // Three Thirty: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_693966b2-abd3-4aa4-94a9-e3f5081a0d47": {
    finding: "supports",
    agreementReference: "e1f7a31c-c2dc-4e33-9676-99c9734a09f5 (STD6040-v1, signed 2026-11-18)",
    basis: "Section 2.1 grants PROtv a non-exclusive licence \"to host, store, encode, transcode, format and stream\" the work \"to viewers through the PROtv Services listed in Schedule 2\" (watchprotv.com and the PROtv apps); no on-demand-only limitation. Ads are permitted \"at natural breaks\" without altering the work. Section 2.2: no cutting or re-editing, so PROtv LIVE airs it complete, with breaks only between programs.",
    caution: "The grant is format-neutral streaming through the PROtv Services. It does not name scheduled linear streaming, so the Owner confirms that reading before recording it.",
  },
  // You Did Me Dirty, You Reap What You Sow: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_08283e5a-f35c-402e-9639-50e1711a5d67": {
    finding: "supports",
    agreementReference: "ab9730ab-3530-4fec-a602-33c58fa444dd (CUSTOM-v1, signed 2026-11-18)",
    basis: "Section 2.1 grants PROtv a non-exclusive licence \"to host, store, encode, transcode, format and stream\" the work \"to viewers through the PROtv Services listed in Schedule 2\" (watchprotv.com and the PROtv apps); no on-demand-only limitation. Ads are permitted \"at natural breaks\" without altering the work. Section 2.2: no cutting or re-editing, so PROtv LIVE airs it complete, with breaks only between programs.",
    caution: "The grant is format-neutral streaming through the PROtv Services. It does not name scheduled linear streaming, so the Owner confirms that reading before recording it.",
  },
  // 2212 (film): reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_dd7efaaf-d87b-44df-93ab-5561936b6a52": {
    finding: "supports",
    agreementReference: "fa57d968-4ad3-41b3-9299-b4049c80b8fa (CUSTOM-v1, signed 2026-11-18)",
    basis: "Section 2.1 grants PROtv a non-exclusive licence \"to host, store, encode, transcode, format and stream\" the work \"to viewers through the PROtv Services listed in Schedule 2\" (watchprotv.com and the PROtv apps); no on-demand-only limitation. Ads are permitted \"at natural breaks\" without altering the work. Section 2.2: no cutting or re-editing, so PROtv LIVE airs it complete, with breaks only between programs.",
    caution: "The grant is format-neutral streaming through the PROtv Services. It does not name scheduled linear streaming, so the Owner confirms that reading before recording it.",
  },
  // 2212 S1E1: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_episode_ac1c153a-2cd4-4c1e-a1ba-813fcbdacd90": {
    finding: "supports",
    agreementReference: "f936d40d-b50e-4d4a-abf7-1d8f0ae88b7a (season agreement, signed 2026-11-19)",
    basis: "Section 2.1 grants PROtv a non-exclusive licence \"to host, store, encode, transcode, format and stream\" the Episodes \"to viewers through the PROtv Services listed in Schedule 2\" (watchprotv.com and the PROtv apps); no on-demand-only limitation. Ads are permitted \"at natural breaks\" without altering the Episodes. Section 2.2: no cutting or re-editing, so PROtv LIVE airs it complete, with breaks only between programs.",
    caution: "Covers Season 1 episodes 1-6 only, each after its delivery record and PROtv publication review.",
  },
  // 2212 S1E2: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_episode_dfad5c66-a17d-41d3-9ebf-6da60fada4fa": {
    finding: "supports",
    agreementReference: "f936d40d-b50e-4d4a-abf7-1d8f0ae88b7a (season agreement, signed 2026-11-19)",
    basis: "Section 2.1 grants PROtv a non-exclusive licence \"to host, store, encode, transcode, format and stream\" the Episodes \"to viewers through the PROtv Services listed in Schedule 2\" (watchprotv.com and the PROtv apps); no on-demand-only limitation. Ads are permitted \"at natural breaks\" without altering the Episodes. Section 2.2: no cutting or re-editing, so PROtv LIVE airs it complete, with breaks only between programs.",
    caution: "Covers Season 1 episodes 1-6 only, each after its delivery record and PROtv publication review.",
  },
  // It's a Double Date a Classic: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8": {
    finding: "supports",
    agreementReference: "1a959a6f-7def-4d8b-91a5-3d38b6923682 (Schedule B, signed 2026-11-07)",
    basis: "Schedule B grants a non-exclusive, worldwide licence to \"host, encode, reproduce as technically necessary, transmit, publicly perform, and make available\" the Title on PROtv; no on-demand-only limitation.",
    caution: "The grant is format-neutral streaming through the PROtv Services. It does not name scheduled linear streaming, so the Owner confirms that reading before recording it.",
  },
  // CAESAR III JUDGEMENT: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_78bcb14d-1a7b-4a3c-85e7-77b1fe95593f": {
    finding: "supports",
    agreementReference: "59a9f315-7de5-4959-a5d3-91935e8a70fc (Schedule B, signed 2026-11-04)",
    basis: "Schedule B grants a non-exclusive, worldwide licence to stream, transmit and publicly perform the work on PROtv-controlled platforms; no on-demand-only limitation.",
    caution: "The grant is format-neutral streaming through the PROtv Services. It does not name scheduled linear streaming, so the Owner confirms that reading before recording it.",
  },
  // Curtain Call: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d": {
    finding: "supports",
    agreementReference: "d2bf0097-5ee7-48a7-ad24-bec96e0d9d0f (Schedule B, signed 2026-11-04)",
    basis: "Schedule B grants a non-exclusive, worldwide licence to stream, transmit and publicly perform the work on PROtv-controlled platforms; no on-demand-only limitation.",
    caution: "The grant is format-neutral streaming through the PROtv Services. It does not name scheduled linear streaming, so the Owner confirms that reading before recording it.",
  },
  // The Lost Camp: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_20752565-9909-4c2b-9f53-c9719ca26769": {
    finding: "supports",
    agreementReference: "ee474291-9c29-417d-9f6f-a330fe8c7f22 (Schedule B, signed 2026-10-17)",
    basis: "Schedule B: \"Creator grants PROtv a nonexclusive, worldwide license to host, stream, distribute, and publicly display The Lost Camp through the PROtv platform and associated applications, including advertising-supported streaming.\" No on-demand-only limitation.",
    caution: "The grant is format-neutral streaming through the PROtv Services. It does not name scheduled linear streaming, so the Owner confirms that reading before recording it.",
  },
  // UNITED NATIONS: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6": {
    finding: "supports",
    agreementReference: "f587ce8e-957b-46aa-b948-d46bcc08003f (Schedule B, signed 2026-10-26)",
    basis: "Schedule B licenses distribution \"through watchprotv.com and PROtv applications ... and other PROtv-operated channels\"; no on-demand-only limitation.",
    caution: "United States only, for 12 months from first availability. PROtv LIVE has no playback geofence, the same position as on demand.",
  },
  // The Thirst: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_613e215e-709f-48ee-91bb-b225d8da4a33": {
    finding: "supports",
    agreementReference: "f2068214-d3f4-4171-b09b-9bcdefd4f527 (replacement agreement, signed 2026-10-26)",
    basis: "The replacement agreement licenses streaming on PROtv and its associated applications; no on-demand-only limitation.",
    caution: "Superseded 2026-11-25: Addendum F (SignWell 92fac4b5, executed 2026-11-22) grants Scheduled Streaming on PROtv LIVE, worldwide, on all PROtv Properties; Schedule 4 lists no exclusions.",
  },
  // Dead Air: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_89303465-51e3-46bb-bd21-ff5ed2db2c49": {
    finding: "not-yet",
    agreementReference: "0b5c3a27-ed44-4c1c-bb0d-102e8ad52c31 (replacement agreement, signed 2026-10-14)",
    basis: "Replacement agreement: \"Nonexclusive license to host, stream, distribute and publicly display only the covered master of Dead Air on PROtv and its associated applications, including advertising-supported streaming.\"",
    caution: "Wait: the agreement asks for the licensor's signing authority to be confirmed in writing; that confirmation is not on file yet.",
  },
  // ITAN: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_3af7527e-f093-41e3-a52e-b4586d315481": {
    finding: "not-yet",
    agreementReference: "ee0b672e-5f00-422d-87c9-d5b5c84dfc7a (Schedule D, signed 2026-11-11)",
    basis: "Schedule D licenses streaming and public performance on PROtv's website, mobile and connected-TV apps.",
    caution: "Wait: Schedule A requires AI-tool commercial-use evidence (Grok, Seedance, Kling, Suno) before release; it is not on file and the title is held from PROtv apps.",
  },
  // Ironborn S1E1: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_episode_bb27d79d-b541-4c38-97f1-6514f016de31": {
    finding: "supports",
    agreementReference: "6689f125-6025-43d4-a371-641f55d38b9e (Schedule E, signed 2026-11-12)",
    expiresOn: "2028-11-11",
    basis: "Section 2.1 grants PROtv a non-exclusive licence \"to host, store, encode, transcode, format and stream\" the Episodes \"to viewers through the PROtv Services listed in Schedule 2\" (watchprotv.com and the PROtv apps); no on-demand-only limitation. Ads are permitted \"at natural breaks\" without altering the Episodes. Section 2.2: no cutting or re-editing, so PROtv LIVE airs it complete, with breaks only between programs.",
    caution: "Premieres from 2026-12-03 at 8 PM ET; schedule it on PROtv LIVE only as a premiere at or after its on-demand release.",
  },
  // Ironborn S1E2: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_episode_cc9f282d-a36b-4242-8545-5a8f601ce806": {
    finding: "supports",
    agreementReference: "6689f125-6025-43d4-a371-641f55d38b9e (Schedule E, signed 2026-11-12)",
    expiresOn: "2028-11-11",
    basis: "Section 2.1 grants PROtv a non-exclusive licence \"to host, store, encode, transcode, format and stream\" the Episodes \"to viewers through the PROtv Services listed in Schedule 2\" (watchprotv.com and the PROtv apps); no on-demand-only limitation. Ads are permitted \"at natural breaks\" without altering the Episodes. Section 2.2: no cutting or re-editing, so PROtv LIVE airs it complete, with breaks only between programs.",
    caution: "Premieres from 2026-12-03 at 8 PM ET; schedule it on PROtv LIVE only as a premiere at or after its on-demand release.",
  },
  // Ironborn S1E3: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_episode_551baf8d-8fe9-428b-bfa8-6da942918240": {
    finding: "supports",
    agreementReference: "6689f125-6025-43d4-a371-641f55d38b9e (Schedule E, signed 2026-11-12)",
    expiresOn: "2028-11-11",
    basis: "Section 2.1 grants PROtv a non-exclusive licence \"to host, store, encode, transcode, format and stream\" the Episodes \"to viewers through the PROtv Services listed in Schedule 2\" (watchprotv.com and the PROtv apps); no on-demand-only limitation. Ads are permitted \"at natural breaks\" without altering the Episodes. Section 2.2: no cutting or re-editing, so PROtv LIVE airs it complete, with breaks only between programs.",
    caution: "Premieres from 2026-12-03 at 8 PM ET; schedule it on PROtv LIVE only as a premiere at or after its on-demand release.",
  },
  // Ironborn S1E4: reviewed 2026-11-21 from the signed wording in the Creator Portal.
  "creator_episode_ee69e77f-aef3-43e3-a7a6-a2fb21bbab4a": {
    finding: "supports",
    agreementReference: "6689f125-6025-43d4-a371-641f55d38b9e (Schedule E, signed 2026-11-12)",
    expiresOn: "2028-11-11",
    basis: "Section 2.1 grants PROtv a non-exclusive licence \"to host, store, encode, transcode, format and stream\" the Episodes \"to viewers through the PROtv Services listed in Schedule 2\" (watchprotv.com and the PROtv apps); no on-demand-only limitation. Ads are permitted \"at natural breaks\" without altering the Episodes. Section 2.2: no cutting or re-editing, so PROtv LIVE airs it complete, with breaks only between programs.",
    caution: "Premieres from 2026-12-03 at 8 PM ET; schedule it on PROtv LIVE only as a premiere at or after its on-demand release.",
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
