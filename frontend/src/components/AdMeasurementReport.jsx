import { useEffect, useState } from 'react';
import { api } from '../api';
import { METRICS, NOT_APPLICABLE, PLACEMENTS, RANGES, cell, isoDay, number, rate, reportCsv } from '../ads/adReport';

function download(report) {
  const blob = new Blob([reportCsv(report)], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `protv-ad-report-${report.from}-to-${report.to}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const loadReport = (range) => api.getAdMeasurementReport(range);

export default function AdMeasurementReport({ load = loadReport }) {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    load({ from: isoDay(days - 1), to: isoDay(0) })
      .then((value) => { if (active) { setReport(value); setError(''); } })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [days, load]);

  return (
    <article className="admin-advertising__card admin-ad-report" aria-labelledby="ad-report-title">
      <header>
        <h3 id="ad-report-title">Advertising measurement</h3>
        <div className="admin-ad-report__range" role="group" aria-label="Reporting period">
          {RANGES.map((range) => (
            <button key={range} type="button" className={`admin-secondary ${days === range ? 'is-active' : ''}`} aria-pressed={days === range} onClick={() => setDays(range)}>
              {range} days
            </button>
          ))}
        </div>
      </header>
      <p>Counted automatically from real ad delivery; viewers are never asked to confirm anything. Figures are valid traffic only, by UTC day. PROtv&apos;s own measurement, not MRC-accredited: Adsterra&apos;s and Google&apos;s reports remain the billing source.</p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {!report && !error && <p>Loading…</p>}
      {report && <>
        {report.configuration?.measurement === false && <p className="admin-error" role="status">Measurement is not configured on the server, so no impressions are being recorded.</p>}
        <div className="admin-ad-report__scroll">
          <table className="admin-ad-report__table">
            <thead>
              <tr><th scope="col">Metric</th>{PLACEMENTS.map((placement) => <th key={placement.placement} scope="col">{placement.title}<small>{placement.platform}{report.configuration && !report.configuration[placement.config] ? ' · not active' : ''}</small></th>)}</tr>
            </thead>
            <tbody>
              {METRICS.map((metric) => (
                <tr key={metric.key}>
                  <th scope="row" title={metric.note || ''}>{metric.label}</th>
                  {PLACEMENTS.map((placement) => {
                    const row = report.placements.find((item) => item.channel === placement.channel && item.placement === placement.placement)?.valid;
                    const value = cell(row, metric, placement.channel);
                    return <td key={placement.placement} className={value === NOT_APPLICABLE ? 'is-unsupported' : ''}>
                      {value === NOT_APPLICABLE ? <span title="This measurement does not apply to this placement">Not applicable</span> : value}
                      {value !== NOT_APPLICABLE && metric.rateOf && <small>{rate(row?.[metric.key] || 0, row?.[metric.rateOf] || 0)}</small>}
                    </td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="admin-ad-report__notes">
          <dt>Roku and Fire TV</dt>
          <dd className="is-unsupported">Not measured: the TV apps have no ad placements. No TV viewability is claimed.</dd>
          <dt>Excluded traffic</dt>
          <dd>{PLACEMENTS.map((placement) => {
            const row = report.placements.find((item) => item.channel === placement.channel && item.placement === placement.placement);
            return <span key={placement.placement}>{placement.title}: {number(row?.invalid?.served)} invalid (automated or excessive frequency), {number(row?.test?.served)} test or Administrator served impressions. </span>;
          })}</dd>
          <dt>Earlier records</dt>
          <dd>{number(report.legacy?.playerImpressions)} player impressions and {number(report.legacy?.providerImpressions)} provider-reported impressions recorded before automatic measurement are kept exactly as recorded. They are not reclassified as served or viewable impressions.</dd>
        </dl>
        {report.titles?.length > 0 && <>
          <h4>Video pre-roll by title</h4>
          <div className="admin-ad-report__scroll">
            <table className="admin-ad-report__table">
              <thead><tr><th scope="col">Title</th><th scope="col">Served</th><th scope="col">Viewable</th><th scope="col">Completions</th><th scope="col">Clicks</th></tr></thead>
              <tbody>{report.titles.map((title) => <tr key={title.videoId}><th scope="row">{title.title || title.videoId}</th><td>{number(title.served)}</td><td>{number(title.viewable)}</td><td>{number(title.completes)}</td><td>{number(title.clicks)}</td></tr>)}</tbody>
            </table>
          </div>
        </>}
        <button type="button" className="admin-secondary" onClick={() => download(report)}>Download sponsor report (CSV)</button>
      </>}
    </article>
  );
}
