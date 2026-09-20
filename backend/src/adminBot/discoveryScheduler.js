class DailyDiscoveryScheduler {
  constructor({ jobs, candidateStore, intervalMs = 24 * 60 * 60 * 1000 }) {
    this.jobs = jobs;
    this.candidateStore = candidateStore;
    this.intervalMs = Number.isFinite(intervalMs) && intervalMs > 0
      ? intervalMs
      : 24 * 60 * 60 * 1000;
    this.timer = null;
  }

  async runIfDue() {
    const status = await this.candidateStore.status();
    const lastRun = status.lastDiscoveryAt ? new Date(status.lastDiscoveryAt).getTime() : 0;
    if (!lastRun || Date.now() - lastRun >= this.intervalMs) {
      try {
        this.jobs.start({ actorId: 'system:pd-discovery' });
      } catch (error) {
        if (!error.message.includes('already running')) throw error;
      }
    }
  }

  start() {
    if (this.timer) return;
    const initial = setTimeout(() => {
      this.runIfDue().catch((error) => {
        console.error(`Automatic Public Domain discovery failed: ${error.message}`);
      });
    }, 15_000);
    initial.unref();
    this.timer = setInterval(() => {
      this.runIfDue().catch((error) => {
        console.error(`Automatic Public Domain discovery failed: ${error.message}`);
      });
    }, Math.min(this.intervalMs, 60 * 60 * 1000));
    this.timer.unref();
  }
}

module.exports = { DailyDiscoveryScheduler };
