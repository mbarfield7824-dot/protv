import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';
import { isApiConfigured } from '../../lib/api';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { titles, playbackUrl, recordProgress, usingFixtures } = useMobile();
  const title = titles.find((item) => item.id === id);
  const [playbackState, setPlaybackState] = useState({ titleId: '', error: '', ready: false });
  const player = useVideoPlayer(null, (instance) => {
    instance.timeUpdateEventInterval = 10;
    instance.keepScreenOnWhilePlaying = true;
  });
  const lastSaved = useRef(0);
  const ready = playbackState.titleId === id && playbackState.ready;
  const error = playbackState.titleId === id ? playbackState.error : '';

  useEffect(() => {
    let active = true;
    lastSaved.current = 0;
    void Promise.resolve()
      .then(() => {
        if (!title) throw new Error('This title is not available.');
        return playbackUrl(title.id);
      })
      .then(async (source) => {
        if (!active) return;
        await player.replaceAsync({ uri: source, contentType: 'hls' });
        if (active) {
          setPlaybackState({ titleId: id, error: '', ready: true });
          player.play();
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setPlaybackState({
            titleId: id,
            error: reason instanceof Error ? reason.message : 'Playback is unavailable.',
            ready: false,
          });
        }
      });
    return () => {
      active = false;
      player.pause();
    };
  }, [id, player, playbackUrl, title]);

  useEffect(() => {
    if (!ready || !title) return;
    const timer = setInterval(() => {
      const position = player.currentTime;
      const duration = player.duration;
      if (position > 1 && duration > 0 && Date.now() - lastSaved.current >= 15000) {
        lastSaved.current = Date.now();
        void recordProgress(title.id, position, duration);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [player, ready, recordProgress, title]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close player"
          onPress={() => router.back()}
          style={styles.close}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <View style={styles.topTitle}>
          <Text numberOfLines={1} style={styles.title}>{title?.title || 'PROtv Player'}</Text>
          {!isApiConfigured ? <Text style={styles.demo}>MUX TEST STREAM · NOT PRODUCTION CONTENT</Text> : null}
        </View>
      </View>
      {ready ? (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls
          fullscreenOptions={{ enable: true }}
        />
      ) : (
        <View style={styles.state}>
          <View style={styles.brandFrame}><Text style={styles.brand}>PRO<Text style={styles.brandAccent}>tv</Text></Text></View>
          <Text style={styles.stateTitle}>{error ? 'Playback unavailable' : 'Preparing your title'}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.stateCopy}>Connecting to the video stream…</Text>}
          {error ? (
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backText}>Back to PROtv</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      {!isApiConfigured && usingFixtures ? (
        <Text style={styles.footerNote}>Prototype mode · sample HLS stream</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', justifyContent: 'center' },
  topBar: { position: 'absolute', zIndex: 2, top: 34, left: 18, right: 18, flexDirection: 'row', alignItems: 'center' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(20,22,30,0.85)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: BRAND.text, fontSize: 29, lineHeight: 31 },
  topTitle: { flex: 1, marginLeft: 12 },
  title: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
  demo: { color: BRAND.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 3 },
  video: { width: '100%', aspectRatio: 16 / 9, maxHeight: '75%' },
  state: { alignItems: 'center', paddingHorizontal: 28 },
  brandFrame: { width: 64, height: 64, borderRadius: 20, borderWidth: 1, borderColor: BRAND.border, backgroundColor: BRAND.surface, alignItems: 'center', justifyContent: 'center' },
  brand: { color: BRAND.text, fontSize: 19, fontWeight: '900' },
  brandAccent: { color: BRAND.accentBright, fontWeight: '700' },
  stateTitle: { color: BRAND.text, fontSize: 17, fontWeight: '800', marginTop: 18 },
  stateCopy: { color: BRAND.muted, fontSize: 12, marginTop: 6 },
  error: { color: '#F3B1B4', fontSize: 12, textAlign: 'center', marginTop: 8 },
  backButton: { marginTop: 20, borderRadius: 8, backgroundColor: BRAND.elevated, paddingHorizontal: 16, paddingVertical: 11 },
  backText: { color: BRAND.text, fontSize: 12, fontWeight: '800' },
  footerNote: { position: 'absolute', bottom: 24, alignSelf: 'center', color: '#A8A8B1', fontSize: 9 },
});
