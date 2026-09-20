const crypto = require('crypto');
const { validateRightsWindow } = require('./rightsValidator');

function stateKey(distributorId, externalId) {
  return crypto.createHash('sha256').update(`${distributorId}:${externalId}`).digest('hex');
}

class DistributorIngestionRunner {
  constructor({
    feedClient,
    posterService,
    catalogService,
    stateStore,
    audit,
    requiredTerritory,
    now = () => new Date(),
  }) {
    this.feedClient = feedClient;
    this.posterService = posterService;
    this.catalogService = catalogService;
    this.stateStore = stateStore;
    this.audit = audit;
    this.requiredTerritory = requiredTerritory;
    this.now = now;
  }

  async run({ actorId, onProgress = () => {} }) {
    const startedAt = new Date().toISOString();
    let feed;
    try {
      feed = await this.feedClient.fetch();
    } catch (error) {
      await this.audit({
        type: 'distributor.error',
        message: 'Distributor feed could not be loaded.',
        actorId,
        details: { error: error.message },
      });
      throw error;
    }

    const report = {
      status: 'running',
      startedAt,
      completedAt: null,
      distributor: feed.distributor,
      addedMovies: [],
      skippedMovies: [],
      failures: [...feed.failures],
      warnings: [],
      technicalOutput: [],
    };
    onProgress(report);

    for (const failure of feed.failures) {
      await this.audit({
        type: 'distributor.error',
        message: `Distributor feed item rejected: ${failure.title}`,
        actorId,
        details: {
          distributorId: feed.distributor.id,
          externalId: failure.externalId,
          error: failure.message,
        },
      });
    }

    for (const [index, item] of feed.items.entries()) {
      const key = stateKey(feed.distributor.id, item.externalId);
      const previous = await this.stateStore.get(key);
      const rights = validateRightsWindow(item.rights, this.requiredTerritory, this.now());
      if (!rights.eligible) {
        let reason = rights.reason;
        if (previous?.status === 'published' && previous.catalogId) {
          try {
            await this.catalogService.unpublish(previous.catalogId, actorId, rights.reason);
            await this.stateStore.set(key, {
              status: 'rights-inactive',
              stage: 'Removed from catalog',
              lastError: rights.reason,
            });
            reason = `Removed from the live catalog. ${rights.reason}`;
            await this.audit({
              type: 'distributor.unpublished',
              message: `Distributor content removed: ${item.title}`,
              actorId,
              details: {
                catalogId: previous.catalogId,
                distributorId: feed.distributor.id,
                externalId: item.externalId,
                reason: rights.reason,
              },
            });
          } catch (error) {
            const message = `Rights are inactive, but the live title could not be removed: ${error.message}`;
            report.failures.push({ title: item.title, message });
            await this.audit({
              type: 'distributor.error',
              message: `Distributor takedown failed: ${item.title}`,
              actorId,
              details: {
                catalogId: previous.catalogId,
                distributorId: feed.distributor.id,
                externalId: item.externalId,
                error: message,
              },
            });
            onProgress(report);
            continue;
          }
        } else {
          await this.audit({
            type: 'distributor.rights-skipped',
            message: `Distributor title not published: ${item.title}`,
            actorId,
            details: { distributorId: feed.distributor.id, externalId: item.externalId, reason },
          });
        }
        report.skippedMovies.push({ title: item.title, reason });
        onProgress(report);
        continue;
      }
      if (previous?.status === 'published') {
        report.skippedMovies.push({
          title: item.title,
          reason: 'This distributor item is already in the live catalog.',
        });
        onProgress(report);
        continue;
      }

      try {
        await this.stateStore.set(key, {
          status: 'processing',
          distributorId: feed.distributor.id,
          externalId: item.externalId,
          title: item.title,
          stage: 'Preparing poster',
        });
        onProgress({
          ...report,
          currentItem: `${item.title} (${index + 1} of ${feed.items.length})`,
        });

        let poster;
        if (item.poster?.rightsConfirmed) {
          try {
            poster = {
              posterUrl: await this.posterService.storeRemoteImage(
                item.poster.url,
                item.title,
                'distributor'
              ),
              source: `${feed.distributor.name} feed`,
              sourcePage: '',
              warnings: [],
            };
          } catch (error) {
            report.warnings.push(`${item.title}: Distributor poster could not be stored: ${error.message}`);
          }
        } else if (item.poster) {
          report.warnings.push(`${item.title}: Distributor poster was not used because its rights were not confirmed.`);
        }
        if (!poster) poster = await this.posterService.create(item);
        report.warnings.push(...poster.warnings.map((message) => `${item.title}: ${message}`));

        const draft = await this.catalogService.createDraft({
          item,
          distributor: feed.distributor,
          poster,
          state: previous,
          actorId,
        });
        await this.stateStore.set(key, {
          catalogId: draft.id,
          stage: 'Transcoding video',
        });
        const ready = await this.catalogService.ensureTranscoded(draft, item.mediaUrl);

        const finalRights = validateRightsWindow(item.rights, this.requiredTerritory, this.now());
        if (!finalRights.eligible) {
          throw new Error(`Rights validation changed before publishing: ${finalRights.reason}`);
        }
        const published = await this.catalogService.publish(ready, actorId);
        await this.stateStore.set(key, {
          status: 'published',
          stage: 'Complete',
          catalogId: published.id,
          publishedAt: new Date().toISOString(),
        });
        try {
          await this.audit({
            type: 'distributor.ingested',
            message: `Distributor content ingested: ${item.title}`,
            actorId,
            details: {
              catalogId: published.id,
              distributorId: feed.distributor.id,
              externalId: item.externalId,
            },
          });
        } catch (auditError) {
          report.warnings.push(`${item.title} was published, but its audit entry could not be saved: ${auditError.message}`);
        }
        report.addedMovies.push({
          title: item.title,
          catalogId: published.id,
          message: `${item.title} was added to the live catalog.`,
        });
        report.technicalOutput.push({
          distributorId: feed.distributor.id,
          externalId: item.externalId,
          catalogId: published.id,
          rights: item.rights,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The distributor title could not be processed.';
        const current = await this.stateStore.get(key);
        await this.stateStore.set(key, {
          status: 'failed',
          stage: 'Needs attention',
          lastError: message,
        });
        await this.audit({
          type: 'distributor.error',
          message: `Distributor content failed: ${item.title}`,
          actorId,
          details: {
            catalogId: current?.catalogId || null,
            distributorId: feed.distributor.id,
            externalId: item.externalId,
            error: message,
          },
        });
        report.failures.push({ title: item.title, message });
      }
      onProgress(report);
    }

    report.status = report.failures.length ? 'completed-with-errors' : 'completed';
    report.completedAt = new Date().toISOString();
    report.currentItem = '';
    report.message = report.failures.length
      ? `Finished with ${report.addedMovies.length} added and ${report.failures.length} needing attention.`
      : `Finished successfully. ${report.addedMovies.length} distributor title${report.addedMovies.length === 1 ? ' was' : 's were'} added.`;
    onProgress(report);
    return report;
  }
}

module.exports = { DistributorIngestionRunner, stateKey };
