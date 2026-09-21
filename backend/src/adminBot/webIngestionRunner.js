const crypto = require('crypto');

function webStateKey(source, identifier) {
  if (identifier === undefined) {
    identifier = source;
    source = 'internet-archive';
  }
  return crypto.createHash('sha256').update(`${source}:${identifier}`).digest('hex');
}

class WebIngestionRunner {
  constructor({ sources, archive, aiMetadataService, posterService, catalogService, stateStore, candidateStore, audit }) {
    this.sources = sources || { 'internet-archive': archive };
    this.aiMetadataService = aiMetadataService;
    this.posterService = posterService;
    this.catalogService = catalogService;
    this.stateStore = stateStore;
    this.candidateStore = candidateStore || { setDecision: async () => {} };
    this.audit = audit;
  }

  async run({ source, identifier, contentKind, candidateId, confirmation, actorId, onProgress = () => {} }) {
    source = source || 'internet-archive';
    candidateId = candidateId || `${source}:${identifier}`;
    if (confirmation !== true) throw new Error('Administrator confirmation is required.');
    const sourceAdapter = this.sources[source];
    if (!sourceAdapter?.resolve) throw new Error('This source is available for reference only.');
    const startedAt = new Date().toISOString();
    const report = {
      status: 'running',
      startedAt,
      completedAt: null,
      addedMovies: [],
      skippedMovies: [],
      failures: [],
      warnings: [],
      previewMovies: [],
      technicalOutput: [],
      currentItem: identifier,
      message: 'Rechecking source evidence.',
    };
    onProgress(report);

    const key = webStateKey(source, identifier);
    try {
      await this.candidateStore.setDecision(candidateId, 'processing', {
        processingBy: actorId,
        progressPercent: 5,
        stage: 'Verifying source rights',
        lastError: '',
      });
      const previous = await this.stateStore.get(key);
      if (previous?.status === 'published') {
        report.skippedMovies.push({
          title: previous.title || identifier,
          reason: 'This source item is already in the live catalog.',
        });
        await this.candidateStore.setDecision(candidateId, 'approved', {
          catalogId: previous.catalogId,
        });
      } else {
        const item = await sourceAdapter.resolve(identifier, contentKind);
        await this.candidateStore.setDecision(candidateId, 'processing', {
          processingBy: actorId,
          progressPercent: 20,
          stage: 'Preparing catalog metadata',
        });
        const confirmedAt = new Date().toISOString();
        await this.audit({
          type: 'pd.web-confirmed',
          message: `Public Domain source confirmed: ${item.title}`,
          actorId,
          details: {
            source: item.source,
            identifier: item.identifier,
            evidence: item.licenseEvidence,
            confirmedAt,
          },
        });
        await this.stateStore.set(key, {
          status: 'processing',
          source: item.source,
          identifier: item.identifier,
          title: item.title,
          stage: 'Preparing catalog metadata',
        });

        const generated = await this.aiMetadataService.enrich({
          title: item.title,
          year: item.year,
          runtime: item.runtime,
          sourceMetadata: {
            description: item.sourceDescription,
            creator: item.creator,
            subjects: item.subjects,
            sourceUrl: item.sourceUrl,
          },
        });
        const metadata = {
          title: item.title,
          year: item.year,
          runtime: item.runtime,
          description: generated.description,
          tags: generated.tags,
          categories: generated.categories,
        };
        await this.candidateStore.setDecision(candidateId, 'processing', {
          processingBy: actorId,
          progressPercent: 40,
          stage: 'Preparing poster artwork',
        });
        let poster;
        try {
          poster = {
            posterUrl: await this.posterService.storeRemoteImage(
              item.posterUrl,
              item.title,
              item.source
            ),
            source: item.source,
            sourcePage: item.sourceUrl,
            warnings: [],
          };
        } catch (error) {
          report.warnings.push(`${item.title}: Source thumbnail was unavailable: ${error.message}`);
          poster = await this.posterService.create(metadata);
        }
        report.warnings.push(...poster.warnings.map((message) => `${item.title}: ${message}`));

        const draft = await this.catalogService.createDraft({
          item: { ...item, candidateId },
          metadata,
          poster,
          previous,
          actorId,
          confirmedAt,
        });
        await this.candidateStore.setDecision(candidateId, 'processing', {
          processingBy: actorId,
          progressPercent: 60,
          stage: 'Sending video to Mux',
          catalogId: draft.id,
        });
        await this.stateStore.set(key, {
          catalogId: draft.id,
          stage: 'Transcoding video',
        });
        const ready = await this.catalogService.ensureTranscoded(draft, item.mediaUrl);
        if (ready.status === 'processing') {
          await this.stateStore.set(key, {
            status: 'processing',
            catalogId: ready.id,
            stage: 'Mux is preparing playback',
          });
          await this.candidateStore.setDecision(candidateId, 'processing', {
            catalogId: ready.id,
            progressPercent: 70,
            stage: 'Mux is preparing playback',
          });
          report.status = 'processing';
          report.message = `${item.title} was sent to Mux and will publish automatically when playback is ready.`;
          report.completedAt = new Date().toISOString();
          report.currentItem = item.title;
          onProgress(report);
          return report;
        }
        const published = await this.catalogService.publish(ready, actorId);
        await this.stateStore.set(key, {
          status: 'published',
          catalogId: published.id,
          stage: 'Complete',
          publishedAt: new Date().toISOString(),
        });
        await this.candidateStore.setDecision(candidateId, 'approved', {
          catalogId: published.id,
          approvedBy: actorId,
          progressPercent: 100,
          stage: 'Published',
        });
        try {
          await this.audit({
            type: 'pd.web-ingested',
            message: `Web Public Domain content ingested: ${item.title}`,
            actorId,
            details: {
              catalogId: published.id,
              source: item.source,
              identifier: item.identifier,
            },
          });
        } catch (auditError) {
          report.warnings.push(`${item.title} was published, but its final audit entry could not be saved: ${auditError.message}`);
        }
        report.addedMovies.push({
          title: item.title,
          catalogId: published.id,
          message: `${item.title} was uploaded to Mux and published.`,
        });
        report.technicalOutput.push({
          source: 'Internet Archive',
          identifier: item.identifier,
          catalogId: published.id,
          sourceFile: item.sourceFile,
          evidence: item.licenseEvidence,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected title could not be ingested.';
      const current = await this.stateStore.get(key);
      await this.stateStore.set(key, {
        status: 'failed',
        stage: 'Needs attention',
        lastError: message,
      });
      await this.candidateStore.setDecision(candidateId, 'failed', {
        lastError: message,
        progressPercent: 100,
        stage: 'Needs attention',
      });
      await this.audit({
        type: 'pd.web-error',
        message: `Web Public Domain ingestion failed: ${current?.title || identifier}`,
        actorId,
        details: {
          catalogId: current?.catalogId || null,
          source,
          identifier,
          error: message,
        },
      });
      report.failures.push({ title: current?.title || identifier, message });
    }

    report.status = report.failures.length ? 'completed-with-errors' : 'completed';
    report.completedAt = new Date().toISOString();
    report.currentItem = '';
    report.message = report.failures.length
      ? 'The selected title needs attention and was not published.'
      : report.addedMovies.length
        ? 'The selected title was published successfully.'
        : 'The selected title was already in the catalog.';
    onProgress(report);
    return report;
  }

  async reconcile(candidate) {
    if (candidate.decision !== 'processing' || !candidate.catalogId) return candidate;
    const video = await this.catalogService.refreshTranscode(candidate.catalogId);
    if (video.status === 'processing') return candidate;
    if (video.status === 'errored') {
      return this.candidateStore.setDecision(candidate.id, 'failed', {
        catalogId: candidate.catalogId,
        lastError: 'Mux could not transcode the selected title. Confirm the source file and retry.',
        progressPercent: 100,
        stage: 'Needs attention',
      });
    }
    if (video.status !== 'ready' || !video.muxPlaybackId) return candidate;

    const actorId = candidate.processingBy || 'system:mux-reconciliation';
    const published = await this.catalogService.publish(video, actorId);
    await this.stateStore.set(webStateKey(candidate.source, candidate.externalId), {
      status: 'published',
      catalogId: published.id,
      stage: 'Complete',
      publishedAt: new Date().toISOString(),
    });
    const approved = await this.candidateStore.setDecision(candidate.id, 'approved', {
      catalogId: published.id,
      approvedBy: actorId,
      progressPercent: 100,
      stage: 'Published',
    });
    await this.audit({
      type: 'pd.web-ingested',
      message: `Web Public Domain content ingested: ${candidate.title}`,
      actorId,
      details: {
        catalogId: published.id,
        source: candidate.source,
        identifier: candidate.externalId,
        recoveredBy: 'status-reconciliation',
      },
    });
    return approved;
  }
}

module.exports = { WebIngestionRunner, webStateKey };
