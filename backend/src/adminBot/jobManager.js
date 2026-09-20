const crypto = require('crypto');

class AdminBotJobManager {
  constructor(runner, options = {}) {
    this.runner = runner;
    this.name = options.name || 'Public Domain Admin Bot';
    this.startMessage = options.startMessage || 'Scanning the Public Domain content directory.';
    this.idleMessage = options.idleMessage || 'The Admin Bot has not run yet.';
    this.current = null;
  }

  start(input) {
    if (this.current?.status === 'running') {
      throw new Error(`${this.name} is already running.`);
    }
    const jobId = crypto.randomUUID();
    this.current = {
      jobId,
      status: 'running',
      message: this.startMessage,
      startedAt: new Date().toISOString(),
      completedAt: null,
      addedMovies: [],
      skippedMovies: [],
      failures: [],
      warnings: [],
      previewMovies: [],
      technicalOutput: [],
    };
    setImmediate(() => {
      this.runner.run({
        ...input,
        onProgress: (report) => {
          this.current = { jobId, ...report };
        },
      }).catch((error) => {
        this.current = {
          ...this.current,
          status: 'failed',
          completedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : 'The Admin Bot stopped unexpectedly.',
          failures: [{
            title: 'Admin Bot',
            message: error instanceof Error ? error.message : 'The Admin Bot stopped unexpectedly.',
          }],
        };
      });
    });
    return this.current;
  }

  status() {
    return this.current || {
      status: 'idle',
      message: this.idleMessage,
      addedMovies: [],
      skippedMovies: [],
      failures: [],
      warnings: [],
      previewMovies: [],
      technicalOutput: [],
    };
  }
}

module.exports = { AdminBotJobManager };
