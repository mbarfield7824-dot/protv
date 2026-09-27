const SIGNALS = new Set([
  'video.live_stream.active',
  'video.live_stream.idle',
  'video.live_stream.disconnected',
  'video.live_stream.disabled',
  'video.live_stream.enabled',
  'video.live_stream.deleted',
]);

function createLiveWebhookHandler({
  getDb = () => require('../firebase').db,
  now = () => new Date(),
} = {}) {
  return async function handleLiveWebhook(event) {
    if (!SIGNALS.has(event?.type)) return false;
    const id = event.id;
    const eventId = event.data?.passthrough;
    const streamId = event.data?.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,255}$/.test(id)
      || typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,255}$/.test(eventId)
      || typeof streamId !== 'string' || !streamId) return true;

    const db = getDb();
    if (!db) throw new Error('Firestore is unavailable for Live webhooks.');
    const ref = db.collection('liveEvents').doc(eventId);
    const receipt = ref.collection('muxWebhookEvents').doc(id);
    await db.runTransaction(async (transaction) => {
      const [snapshot, delivered] = await Promise.all([
        transaction.get(ref),
        transaction.get(receipt),
      ]);
      if (!snapshot.exists || delivered.exists) return;
      const current = snapshot.data();
      if (current.streamProvisioning?.state !== 'provisioned'
        || current.muxLiveStreamId !== streamId) return;

      const signal = {
        type: event.type,
        webhookEventId: id,
        receivedAt: now(),
      };
      if (typeof event.created_at === 'string' && event.created_at.length <= 64) {
        signal.muxCreatedAt = event.created_at;
      }
      transaction.create(receipt, signal);
      transaction.update(ref, { muxOperationalSignal: signal });
    });
    return true;
  };
}

module.exports = { createLiveWebhookHandler };
