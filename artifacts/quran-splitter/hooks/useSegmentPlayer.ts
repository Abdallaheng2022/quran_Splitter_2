import { useAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { useI18n } from "@/lib/i18n";

// Plays slices [startSec, endSec] of a single local audio file. expo-audio has
// no native "play range" API, so we seek to the start, play, and poll
// currentTime to pause when the slice ends.
export function useSegmentPlayer(uri: string | null) {
  const { t } = useI18n();
  const player = useAudioPlayer(uri ?? undefined);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  // Live playback position (seconds into the file) while a segment plays, used
  // to draw the moving playhead on each segment's slider.
  const [position, setPosition] = useState(0);
  const stopAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    stopAtRef.current = null;
    try {
      player.pause();
    } catch {
      // player may be released
    }
    setPlayingIndex(null);
  }, [clearTimer, player]);

  const play = useCallback(
    (index: number, startSec: number, endSec: number) => {
      clearTimer();
      stopAtRef.current = endSec;
      try {
        player.seekTo(startSec);
        player.play();
      } catch {
        stopAtRef.current = null;
        Alert.alert(t("playbackFailed"), t("playbackFailedMsg"));
        return;
      }
      setPlayingIndex(index);
      setPosition(startSec);
      intervalRef.current = setInterval(() => {
        const limit = stopAtRef.current;
        if (limit == null) return;
        const cur = player.currentTime;
        setPosition(cur);
        if (cur >= limit) {
          stop();
        }
      }, 100);
    },
    [clearTimer, player, stop, t],
  );

  // Jump playback to an absolute time in the file (used by the slider playhead).
  const seek = useCallback(
    (sec: number) => {
      try {
        player.seekTo(sec);
      } catch {
        // player may be released
      }
      setPosition(sec);
    },
    [player],
  );

  const toggle = useCallback(
    (index: number, startSec: number, endSec: number) => {
      if (playingIndex === index) {
        stop();
      } else {
        play(index, startSec, endSec);
      }
    },
    [play, playingIndex, stop],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { playingIndex, position, toggle, stop, seek };
}
