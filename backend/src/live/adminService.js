const { LiveValidationError, validateEvent } = require('./adminModel');
const { randomUUID } = require('node:crypto');

function createAdminLiveService({
  getDb = () => require('../firebase').db,
  now = () => new Date(),
  createStream = (options) => require('../mux').mux.video.liveStreams.create(options),
} = {}) {
  function database() {
    const db = getDb();
    if (!db) throw new Error('Firestore is unavailable for Live administration.');
    return db;
  }

  return {
    async list() {
      const snapshot = await database().collection('liveEvents').get();
      return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    },
    async get(id) {
      const snapshot = await database().collection('liveEvents').doc(id).get();
      return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
    },
    async create(input) {
      const fields = validateEvent(input);
      const ref = database().collection('liveEvents').doc();
      const timestamp = now();
      const event = { ...fields, createdAt: timestamp, updatedAt: timestamp };
      await ref.create(event);
      return { ...event, id: ref.id };
    },
    async update(id, input) {
      const db = database();
      const ref = db.collection('liveEvents').doc(id);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return null;
        const current = snapshot.data();
        if (current.muxLiveStreamId && input?.accessPolicy === 'paid') {
          throw new LiveValidationError('A public Live stream cannot become a paid event.');
        }
        const fields = validateEvent(input, current);
        const updated = { ...fields, updatedAt: now() };
        transaction.update(ref, updated);
        return { ...current, ...updated, id: snapshot.id };
      });
    },
    async provisionStream(id) {
      const db = database();
      const ref = db.collection('liveEvents').doc(id);
      const reservationId = randomUUID();
      const reservation = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return { state: 'missing' };
        const event = snapshot.data();
        const state = event.streamProvisioning?.state;
        if (state === 'provisioned' && event.muxLiveStreamId && event.muxPlaybackId) {
          return { state, id: event.muxLiveStreamId, playbackId: event.muxPlaybackId };
        }
        if (state || event.muxLiveStreamId || event.muxPlaybackId) return { state: 'blocked' };
        if (event.status !== 'scheduled' || event.accessPolicy !== 'free' || event.published !== false) {
          return { state: 'ineligible' };
        }
        transaction.update(ref, {
          streamProvisioning: { state: 'reserved', reservationId, reservedAt: now() },
        });
        return { state: 'reserved' };
      });
      if (reservation.state !== 'reserved') return reservation;

      let stream;
      try {
        stream = await createStream({ playback_policies: ['public'], passthrough: id });
        const playbackId = stream?.playback_ids?.find((entry) => entry.policy === 'public')?.id;
        if (!stream?.id || !playbackId) throw new Error('Mux did not return a public playback ID.');
        const attached = await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(ref);
          const current = snapshot.exists ? snapshot.data() : null;
          if (current?.streamProvisioning?.state !== 'reserved'
            || current.streamProvisioning.reservationId !== reservationId
            || current.status !== 'scheduled' || current.accessPolicy !== 'free'
            || current.published !== false) return false;
          transaction.update(ref, {
            muxLiveStreamId: stream.id,
            muxPlaybackId: playbackId,
            streamProvisioning: { state: 'provisioned', provisionedAt: now() },
          });
          return true;
        });
        if (attached) return { state: 'provisioned', id: stream.id, playbackId };
      } catch {
        // The create request may have reached Mux even when it throws.
      }
      try {
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(ref);
          if (snapshot.exists && snapshot.data().streamProvisioning?.reservationId === reservationId) {
            transaction.update(ref, {
              streamProvisioning: { state: 'recovery_required', reservedAt: snapshot.data().streamProvisioning.reservedAt },
            });
          }
        });
      } catch {
        console.error('Unable to mark Live stream provisioning for manual recovery.');
      }
      return { state: 'recovery_required' };
    },
    async streamStatus(id) {
      const snapshot = await database().collection('liveEvents').doc(id).get();
      if (!snapshot.exists) return null;
      const event = snapshot.data();
      return {
        state: event.streamProvisioning?.state || 'unprovisioned',
        ...(event.streamProvisioning?.state === 'provisioned'
          ? { muxLiveStreamId: event.muxLiveStreamId, muxPlaybackId: event.muxPlaybackId }
          : {}),
      };
    },
  };
}

module.exports = { createAdminLiveService };
