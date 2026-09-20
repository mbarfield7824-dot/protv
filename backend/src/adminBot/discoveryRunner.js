class PublicDomainDiscoveryRunner {
  constructor({ providers, candidateStore, audit }) {
    this.providers = providers;
    this.candidateStore = candidateStore;
    this.audit = audit;
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
    await this.candidateStore.upsert(unique);
    const queueStatus = await this.candidateStore.status();
    await this.audit({
      type: 'pd.discovery',
      message: `Public Domain discovery completed: ${unique.length} candidates found.`,
      actorId,
      details: {
        discovered: unique.length,
        pending: queueStatus.pending,
        sources: report.sourceResults,
      },
    });
    report.status = report.failures.length ? 'completed-with-errors' : 'completed';
    report.completedAt = new Date().toISOString();
    report.candidatesFound = unique.length;
    report.pendingCandidates = queueStatus.pending;
    report.message = report.failures.length
      ? `Discovery finished with ${unique.length} candidates and ${report.failures.length} source issue${report.failures.length === 1 ? '' : 's'}.`
      : `Discovery complete. ${unique.length} candidates were reviewed across trusted sources.`;
    onProgress(report);
    return report;
  }
}

module.exports = { PublicDomainDiscoveryRunner };
