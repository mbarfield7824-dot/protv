import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';
import { seriesEpisodes } from '../../data/catalog';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { titles, playbackUrl, recordProgress, progress, usingFixtures, catalogLoading, accountError } = useMobile();
  const title = titles.find((item) => item.id === id);
  const episodes = seriesEpisodes(title, titles);
  const nextEpisode = episodes[episodes.findIndex((episode) => episode.id === id) + 1];
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ titleId: '', error: '', ready: false, ended: false });
  const player = useVideoPlayer(null, (instance) => {
    instance.timeUpdateEventInterval = 5;
    instance.keepScreenOnWhilePlaying = true;
  });
  const progressRef = useRef(progress);
  const saveRef = useRef(recordProgress);
  useEffect(() => {
    progressRef.current = progress;
    saveRef.current = recordProgress;
  }, [progress, recordProgress]);
  const ready = state.titleId === id && state.ready;
  const error = state.titleId === id ? state.error : '';

  useEffect(() => {
    if (catalogLoading) return;
    let active = true;
    let loaded = false;
    let lastSaved = 0;
    const saved = progressRef.current[id];
    const resumeAt = saved && saved.progressPercent < 95 ? saved.positionSeconds : 0;
    const save = (finished = false) => {
      if (!loaded || !title) return;
      const duration = player.duration;
      const position = finished ? duration : player.currentTime;
      if (Number.isFinite(duration) && duration > 0 && position >= 0) {
        lastSaved = Date.now();
        void saveRef.current(title.id, position, duration);
      }
    };
    const source = player.addListener('sourceLoad', ({ duration }) => {
      if (!active) return;
      loaded = true;
      player.currentTime = resumeAt > 0 && resumeAt < duration * 0.95 ? resumeAt : 0;
      setState({ titleId: id, error: '', ready: true, ended: false });
      player.play();
    });
    const status = player.addListener('statusChange', ({ status: nextStatus, error: failure }) => {
      if (active && nextStatus === 'error') {
        setState({ titleId: id, error: failure?.message || 'The video stream could not be played.', ready: false, ended: false });
      }
    });
    const time = player.addListener('timeUpdate', () => {
      if (Date.now() - lastSaved >= 15000) save();
    });
    const playing = player.addListener('playingChange', ({ isPlaying }) => {
      if (!isPlaying) save();
    });
    const ended = player.addListener('playToEnd', () => {
      save(true);
      if (active) setState({ titleId: id, error: '', ready: true, ended: true });
    });
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        save();
        player.pause();
      }
    });
    const timeout = setTimeout(() => {
      if (active && !loaded) {
        player.pause();
        setState({ titleId: id, error: 'The stream took too long to start. Please retry.', ready: false, ended: false });
      }
    }, 30000);
    void Promise.resolve()
      .then(() => {
        if (!title) throw new Error('This title is not available.');
        return playbackUrl(title.id);
      })
      .then(async (uri) => {
        if (active) await player.replaceAsync({ uri, contentType: 'hls', metadata: { title: title?.title } });
      })
      .catch((reason: unknown) => {
        if (active) setState({
          titleId: id, error: reason instanceof Error ? reason.message : 'Playback is unavailable.', ready: false, ended: false,
        });
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      save();
      source.remove();
      status.remove();
      time.remove();
      playing.remove();
      ended.remove();
      appState.remove();
      player.pause();
    };
  }, [attempt, catalogLoading, id, playbackUrl, player, title]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close player"
          onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <View style={styles.topTitle}>
          <Text numberOfLines={1} style={styles.title}>{title?.title || 'PROtv Player'}</Text>
          {usingFixtures ? <Text style={styles.demo}>MUX TEST STREAM · NOT PRODUCTION CONTENT</Text> : null}
        </View>
      </View>
      <View style={styles.videoArea}>
        {ready && !error ? (
          <VideoView player={player} style={styles.video} contentFit="contain"
            nativeControls fullscreenOptions={{ enable: true }} />
        ) : (
          <View style={styles.state}>
            <Text style={styles.brand}>PRO<Text style={styles.brandAccent}>tv</Text></Text>
            <Text style={styles.stateTitle}>{error ? 'Playback unavailable' : 'Preparing your title'}</Text>
            <Text accessibilityRole={error ? 'alert' : undefined} style={error ? styles.error : styles.stateCopy}>
              {error || 'Connecting to the video stream...'}
            </Text>
            {error ? (
              <Pressable accessibilityRole="button" onPress={() => {
                setState({ titleId: id, error: '', ready: false, ended: false });
                setAttempt((current) => current + 1);
              }} style={styles.button}>
                <Text style={styles.buttonText}>Retry playback</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
      {state.titleId === id && state.ended ? (
        <View style={styles.endActions}>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
            player.replay();
            setState({ titleId: id, error: '', ready: true, ended: false });
          }}><Text style={styles.buttonText}>Watch again</Text></Pressable>
          {nextEpisode ? (
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
              router.replace({ pathname: '/player/[id]', params: { id: nextEpisode.id } });
            }}><Text style={styles.buttonText}>Next episode: {nextEpisode.title}</Text></Pressable>
          ) : null}
        </View>
      ) : null}
      {accountError ? <Text accessibilityRole="alert" style={styles.error}>{accountError}</Text> : null}
      {usingFixtures ? <Text style={styles.footerNote}>Prototype mode · sample HLS stream</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND.elevated, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: BRAND.text, fontSize: 29, lineHeight: 31 },
  topTitle: { flex: 1, marginLeft: 12 },
  title: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
  demo: { color: BRAND.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 3 },
  videoArea: { flex: 1, minHeight: 0 },
  video: { flex: 1, width: '100%', height: '100%' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  brand: { color: BRAND.text, fontSize: 24, fontWeight: '900' },
  brandAccent: { color: BRAND.accentBright },
  stateTitle: { color: BRAND.text, fontSize: 17, fontWeight: '800', marginTop: 18 },
  stateCopy: { color: BRAND.muted, fontSize: 12, marginTop: 6 },
  error: { color: '#F3B1B4', fontSize: 12, textAlign: 'center', margin: 8 },
  button: { margin: 8, borderRadius: 8, backgroundColor: BRAND.elevated, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { color: BRAND.text, fontSize: 12, fontWeight: '800' },
  endActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  footerNote: { textAlign: 'center', padding: 8, color: BRAND.muted, fontSize: 9 },
});
