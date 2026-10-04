const { filterExistingCatalogCandidates } = require('./catalogDeduplication');

class PublicDomainDiscoveryRunner {
  constructor({ providers, candidateStore, audit, loadPublicCatalog = async () => [] }) {
    this.providers = providers;
    this.candidateStore = candidateStore;
    this.audit = audit;
    this.loadPublicCatalog = loadPublicCatalog;
  }

  async run({ actorId = 'system:pd-discovery', onProgress = () => {} }) {
    const report = {
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      message: 'Searching trusted content sources.',
      sourceResults: [],
      failures: [],
      warnings: [],
      addedMovies: [],
      skippedMovies: [],
      previewMovies: [],
      technicalOutput: [],
    };
    onProgress(report);

    const candidates = [];
    for (const provider of this.providers) {
      try {
        const result = await provider.discover();
        candidates.push(...result.items);
        report.sourceResults.push({
          source: provider.name,
          found: result.items.length,
          status: result.warning ? 'limited' : 'complete',
        });
        if (result.warning) report.warnings.push(result.warning);
      } catch (error) {
        report.failures.push({ title: provider.name, message: error.message });
        report.sourceResults.push({ source: provider.name, found: 0, status: 'failed' });
      }
      onProgress(report);
    }

    const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
    const catalogMatches = filterExistingCatalogCandidates(
      unique,
      await this.loadPublicCatalog()
    );
    const previousCandidates = await this.candidateStore.all();
    const handledIds = new Set(previousCandidates
      .filter((candidate) => ['approved', 'rejected'].includes(candidate.decision))
      .map((candidate) => candidate.id));
    const handledExcluded = catalogMatches.items.filter((candidate) => handledIds.has(candidate.id)).length;
    const activeCandidates = catalogMatches.items.filter((candidate) => !handledIds.has(candidate.id));
    await this.candidateStore.upsert(activeCandidates);
    const queueStatus = await this.candidateStore.status();
    await this.audit({
      type: 'pd.discovery',
      message: `Public Domain discovery completed: ${activeCandidates.length} candidates found.`,
      actorId,
      details: {
        discovered: unique.length,
        excludedFromCatalog: catalogMatches.excluded,
        excludedAsHandled: handledExcluded,
        pending: queueStatus.pending,
        sources: report.sourceResults,
      },
    });
    report.status = report.failures.length ? 'completed-with-errors' : 'completed';
    report.completedAt = new Date().toISOString();
    report.candidatesFound = activeCandidates.length;
    report.catalogExcluded = catalogMatches.excluded;
    report.handledExcluded = handledExcluded;
    report.pendingCandidates = queueStatus.pending;
    report.message = report.failures.length
      ? `Discovery finished with ${activeCandidates.length} candidates and ${report.failures.length} source issue${report.failures.length === 1 ? '' : 's'}.`
      : `Discovery complete. ${activeCandidates.length} candidates were reviewed across trusted sources.`;
    onProgress(report);
    return report;
  }
}

module.exports = { PublicDomainDiscoveryRunner };
