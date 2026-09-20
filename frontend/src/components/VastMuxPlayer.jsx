import { useEffect, useRef, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import { api } from '../api';

const IMA_SDK_URL = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';

function loadImaSdk() {
  if (window.google?.ima) return Promise.resolve(window.google.ima);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${IMA_SDK_URL}"]`);
    const script = existing || document.createElement('script');
    const loaded = () => window.google?.ima
      ? resolve(window.google.ima)
      : reject(new Error('Google IMA did not initialize.'));
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', () => reject(new Error('Google IMA could not be loaded.')), { once: true });
    if (!existing) {
      script.src = IMA_SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export default function VastMuxPlayer({ video, playerRef }) {
  const containerRef = useRef(null);
  const adContainerRef = useRef(null);
  const [adVisible, setAdVisible] = useState(false);
  const [adNotice, setAdNotice] = useState('');

  useEffect(() => {
    let disposed = false;
    let adsLoader;
    let adsManager;
    let resizeObserver;
    let contentPlayHandler;
    let contentPlayer;
    let adStarted = false;
    let userRequestedPlayback = false;
    let sessionToken = '';

    const sendEvent = (eventType) => {
      if (!sessionToken) return;
      void api.recordAdEvent(sessionToken, eventType).catch((error) => {
        console.warn(`Ad ${eventType} telemetry was not recorded:`, error.message);
      });
    };

    const resumeContent = () => {
      if (disposed) return;
      setAdVisible(false);
      setAdNotice('');
      if (userRequestedPlayback) void contentPlayer?.play().catch(() => {});
    };

    const failOpen = (error) => {
      console.warn('VAST pre-roll unavailable:', error);
      sendEvent('error');
      adsManager?.destroy();
      resumeContent();
    };

    const startAds = (ima) => {
      if (!adsManager || !userRequestedPlayback || adStarted || disposed) return;
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds?.width || !bounds.height) return;
      adStarted = true;
      try {
        adsManager.init(
          Math.round(bounds.width),
          Math.round(bounds.height),
          ima.ViewMode.NORMAL,
        );
        adsManager.start();
      } catch (error) {
        failOpen(error);
      }
    };

    async function initialize() {
      const configuration = await api.getAdSession(video.id);
      if (!configuration.enabled || disposed) return;
      sessionToken = configuration.sessionToken;
      const ima = await loadImaSdk();
      if (disposed) return;
      const player = playerRef.current;
      const adContainer = adContainerRef.current;
      if (!player || !adContainer) throw new Error('The video player is not ready for advertising.');
      contentPlayer = player;

      const displayContainer = new ima.AdDisplayContainer(adContainer, player);
      adsLoader = new ima.AdsLoader(displayContainer);
      adsLoader.addEventListener(
        ima.AdErrorEvent.Type.AD_ERROR,
        (event) => failOpen(event.getError()),
        false,
      );
      adsLoader.addEventListener(
        ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        (event) => {
          adsManager = event.getAdsManager(player, new ima.AdsRenderingSettings());
          adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (adError) => failOpen(adError.getError()));
          adsManager.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
            setAdVisible(true);
            setAdNotice('Advertisement');
            player.pause();
          });
          adsManager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, resumeContent);
          adsManager.addEventListener(ima.AdEvent.Type.IMPRESSION, () => sendEvent('impression'));
          adsManager.addEventListener(ima.AdEvent.Type.STARTED, () => sendEvent('started'));
          adsManager.addEventListener(ima.AdEvent.Type.COMPLETE, () => sendEvent('completed'));
          adsManager.addEventListener(ima.AdEvent.Type.SKIPPED, () => sendEvent('skipped'));
          startAds(ima);
        },
        false,
      );

      contentPlayHandler = () => {
        if (adStarted) return;
        userRequestedPlayback = true;
        player.pause();
        setAdVisible(true);
        setAdNotice('Advertisement loading…');
        displayContainer.initialize();
        startAds(ima);
      };
      player.addEventListener('play', contentPlayHandler);

      const bounds = containerRef.current.getBoundingClientRect();
      const request = new ima.AdsRequest();
      request.adTagUrl = configuration.adTagUrl;
      request.linearAdSlotWidth = Math.round(bounds.width);
      request.linearAdSlotHeight = Math.round(bounds.height);
      request.nonLinearAdSlotWidth = Math.round(bounds.width);
      request.nonLinearAdSlotHeight = Math.min(150, Math.round(bounds.height));
      adsLoader.requestAds(request);

      resizeObserver = new ResizeObserver((entries) => {
        if (!adsManager || !adStarted) return;
        const rectangle = entries[0]?.contentRect;
        if (rectangle) adsManager.resize(
          Math.round(rectangle.width),
          Math.round(rectangle.height),
          ima.ViewMode.NORMAL,
        );
      });
      resizeObserver.observe(containerRef.current);
    }

    initialize().catch(failOpen);
    return () => {
      disposed = true;
      if (contentPlayHandler) contentPlayer?.removeEventListener('play', contentPlayHandler);
      resizeObserver?.disconnect();
      adsManager?.destroy();
      adsLoader?.destroy();
    };
  }, [playerRef, video.id]);

  return (
    <div className="vast-player-shell" ref={containerRef}>
      <MuxPlayer
        ref={playerRef}
        streamType="on-demand"
        playbackId={video.muxPlaybackId}
        metadata={{ video_id: video.id, video_title: video.title }}
        accentColor="#4169E1"
        style={{ width: '100%', height: '100%' }}
      />
      <div
        ref={adContainerRef}
        className={`vast-ad-container ${adVisible ? 'is-visible' : ''}`}
        aria-hidden={!adVisible}
      />
      {adVisible && adNotice && <div className="vast-ad-notice">{adNotice}</div>}
    </div>
  );
}
