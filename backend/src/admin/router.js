const express = require('express');
const { verifyAdmin } = require('../middleware/auth');
const { AdminAssistantService } = require('./adminAssistantService');

function createAdminAssistantRouter() {
  const router = express.Router();
  const service = new AdminAssistantService();

  router.post('/query', verifyAdmin, async (req, res) => {
    try {
      const reply = await service.query({
        message: req.body?.message,
        actorId: req.user.uid,
        contextCatalogId: req.body?.contextCatalogId,
        history: req.body?.history,
      });
      res.json(reply);
    } catch (error) {
      try {
        await service.logFailureReply(req.user?.uid || 'unknown', error.message);
      } catch (loggingError) {
        console.error(`Administrator Assistant error logging failed: ${loggingError.message}`);
      }
      const invalidMessage = error.message.includes('Enter a message')
        || error.message.includes('characters or fewer');
      res.status(invalidMessage ? 400 : 500).json({ error: error.message });
    }
  });

  const confirmedAction = (type) => async (req, res) => {
    try {
      const result = await service.executeConfirmedAction({
        confirmationId: req.body?.confirmationId,
        catalogId: req.body?.catalogId,
        confirmed: req.body?.confirmed,
        actorId: req.user.uid,
        type,
      });
      res.json(result);
    } catch (error) {
      try {
        await service.logFailureReply(req.user?.uid || 'unknown', error.message);
      } catch (loggingError) {
        console.error(`Administrator Assistant action error logging failed: ${loggingError.message}`);
      }
      const invalidRequest = error.message.includes('required')
        || error.message.includes('invalid')
        || error.message.includes('expired')
        || error.message.includes('does not match')
        || error.message.includes('not found')
        || error.message.includes('rights')
        || error.message.includes('unsupported');
      res.status(invalidRequest ? 400 : 500).json({
        success: false,
        message: 'The catalog change was not completed.',
        error: error.message,
      });
    }
  };

  router.post('/update-poster', verifyAdmin, confirmedAction('update-poster'));
  router.post('/update-metadata', verifyAdmin, confirmedAction('update-metadata'));
  router.post('/regenerate-poster', verifyAdmin, confirmedAction('regenerate-poster'));
  router.post('/regenerate-metadata', verifyAdmin, confirmedAction('regenerate-metadata'));

  return router;
}

module.exports = { createAdminAssistantRouter };
