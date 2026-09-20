class AdminBotRunner {
  constructor({
    discover,
    metadataExtractor,
    posterService,
    catalogService,
    stateStore,
    audit,
  }) {
    this.discover = discover;
    this.metadataExtractor = metadataExtractor;
    this.posterService = posterService;
    this.catalogService = catalogService;
    this.stateStore = stateStore;
    this.audit = audit;
  }

  async run({ directory, actorId, dryRun = false, onProgress = () => {} }) {
    const startedAt = new Date().toISOString();
    let discovered;
    try {
      discovered = await this.discover({ directory, stateStore: this.stateStore });
    } catch (error) {
      await this.audit({
        type: 'pd.error',
        message: 'Public Domain content scan failed.',
        actorId,
        details: { error: error.message },
      });
      throw error;
    }
    const report = {
      status: 'running',
      startedAt,
      completedAt: null,
      addedMovies: [],
      skippedMovies: discovered.skipped,
      failures: [],
      warnings: [],
      previewMovies: [],
      dryRun,
      technicalOutput: [],
    };
    onProgress(report);

    for (const [index, item] of discovered.newItems.entries()) {
      const position = `${index + 1} of ${discovered.newItems.length}`;
      let title = item.fileName;
      try {
        if (!dryRun) {
          await this.stateStore.set(item.hash, {
            status: 'processing',
            filePath: item.filePath,
            fileName: item.fileName,
            stage: 'Preparing metadata',
          });
        }
        onProgress({ ...report, currentItem: `${item.fileName} (${position})` });

        const metadata = await this.metadataExtractor.extract(item.filePath);
        title = metadata.title;
        if (!dryRun) {
          await this.stateStore.set(item.hash, {
            title: metadata.title,
            metadata,
            stage: 'Preparing poster',
          });
        }
        const poster = await this.posterService.create(metadata);
        report.warnings.push(...poster.warnings.map((message) => `${metadata.title}: ${message}`));

        if (dryRun) {
          report.previewMovies.push({
            title: metadata.title,
            message: 'Metadata and poster preparation succeeded. Nothing was published.',
          });
          report.technicalOutput.push({
            fileName: item.fileName,
            fileHash: item.hash,
            metadata,
            poster,
            dryRun: true,
          });
          await this.audit({
            type: 'pd.dry-run',
            message: `PD dry run completed: ${metadata.title}`,
            actorId,
            details: { fileHash: item.hash },
          });
          onProgress(report);
          continue;
        }

        const draft = await this.catalogService.createDraft({
          item,
          metadata,
          poster,
          actorId,
        });
        await this.stateStore.set(item.hash, {
          catalogId: draft.id,
          poster,
          stage: 'Transcoding video',
        });

        const ready = await this.catalogService.ensureTranscoded(draft, item.filePath);
        const published = await this.catalogService.publish(ready, actorId);
        await this.stateStore.set(item.hash, {
          status: 'published',
          stage: 'Complete',
          catalogId: published.id,
          title: metadata.title,
          publishedAt: new Date().toISOString(),
        });
        try {
          await this.audit({
            type: 'pd.ingested',
            message: `PD content ingested: ${metadata.title}`,
            actorId,
            details: { catalogId: published.id, fileHash: item.hash },
          });
        } catch (auditError) {
          report.warnings.push(
            `${metadata.title} was published, but its audit entry could not be saved: ${auditError.message}`
          );
        }
        report.addedMovies.push({
          title: metadata.title,
          catalogId: published.id,
          message: `${metadata.title} was added to the live catalog.`,
        });
        report.technicalOutput.push({
          fileName: item.fileName,
          fileHash: item.hash,
          catalogId: published.id,
          metadata,
          poster,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The movie could not be processed.';
        const current = dryRun ? null : await this.stateStore.get(item.hash);
        if (!dryRun) {
          await this.stateStore.set(item.hash, {
            status: 'failed',
            stage: 'Needs attention',
            lastError: message,
          });
        }
        await this.audit({
          type: 'pd.error',
          message: `PD ${dryRun ? 'dry run' : 'content'} failed: ${current?.title || title}`,
          actorId,
          details: {
            catalogId: current?.catalogId || null,
            fileHash: item.hash,
            error: message,
          },
        });
        report.failures.push({
          title: current?.title || title,
          message,
        });
      }
      onProgress(report);
    }

    report.status = report.failures.length ? 'completed-with-errors' : 'completed';
    report.completedAt = new Date().toISOString();
    report.currentItem = '';
    report.message = report.failures.length
      ? `Finished with ${dryRun ? report.previewMovies.length : report.addedMovies.length} prepared and ${report.failures.length} needing attention.`
      : dryRun
        ? `Safe test complete. ${report.previewMovies.length} movie${report.previewMovies.length === 1 ? ' is' : 's are'} ready for a live run. Nothing was published.`
        : `Finished successfully. ${report.addedMovies.length} movie${report.addedMovies.length === 1 ? ' was' : 's were'} added.`;
    onProgress(report);
    return report;
  }
}

module.exports = { AdminBotRunner };
