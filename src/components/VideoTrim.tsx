import React, { useEffect, useRef, useState } from 'react';
import { BsPlay, BsPause, BsVr, BsFileX } from 'react-icons/bs';
import { usePointerDrag } from 'react-use-pointer-drag';
import clsx from 'clsx';

import styles from './VideoTrim.module.scss';
import { clamp, humanTime } from '../helpers';
import { Time } from '../types';

interface VideoTrimProps {
  onChange: (time: Time[]) => void;
  trimTime?: Time[];
  video: HTMLVideoElement;
}

const MIN_DURATION = 1;
const DURATION_SNAP_FACTOR = 0.02;

const vidPercent = (vid: HTMLVideoElement, time: number) =>
  (time / vid.duration) * 100;

export const VideoTrim: React.FC<VideoTrimProps> = ({
  onChange,
  video,
  trimTime = [[0, video.duration]] as Time[],
}) => {
  const [currentTime, setCurrentTime] = useState(video.currentTime);
  const [playing, setPlaying] = useState(!video.paused);
  const ignoreTimeUpdatesRef = useRef(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  // const time = trimTime[0];

  const handleSplitSegment = (index: number) => {
    const segment = trimTime[index];
    const midpoint = (segment[0] + segment[1]) / 2;
    const newTrimTime = [
      ...trimTime.slice(0, index),
      [segment[0], midpoint] as Time,
      [midpoint, segment[1]] as Time,
      ...trimTime.slice(index + 1),
    ];
    onChange(newTrimTime);
  };

  const handleDeleteSegment = (index: number) => {
    const newTrimTime = [
      ...trimTime.slice(0, index),
      ...trimTime.slice(index + 1),
    ];
    onChange(newTrimTime);
  };

  const { dragProps, dragState } = usePointerDrag<{
    id?: number;
    direction: string;
    time?: Time;
    currentTime?: number;
    paused: boolean;
  }>({
    stopPropagation: true,
    pointerDownStopPropagation: true,
    onStart: () => {
      video.pause();
    },
    onClick: ({ state, x }) => {
      if (state.direction !== 'move') {
        return;
      }

      const rect = timelineRef.current!.getBoundingClientRect();
      const relativeX =
        clamp((x - rect.left) / rect.width, 0, 1) * video.duration;
      // const currentTime = clamp(relativeX, state.time![0], state.time![1]);
      const currentTime = clamp(relativeX, 0, video.duration);
      setCurrentTime(currentTime);
      video.currentTime = currentTime;
    },
    onMove: ({ x, deltaX, state }) => {
      ignoreTimeUpdatesRef.current = true;
      const rect = timelineRef.current!.getBoundingClientRect();

      let relativeX =
        clamp((x - rect.left) / rect.width, 0, 1) * video.duration;

      // Index of selected range
      const cur = state.id || 0;
      const newTime: Time[] = [...trimTime];

      switch (state.direction) {
        case 'move':
          {
            relativeX = clamp(
              (deltaX / rect.width) * video.duration,
              -1 * state.time![0],
              video.duration - state.time![1],
            );
            newTime[cur][0] = state.time![0] + relativeX;
            newTime[cur][1] = state.time![1] + relativeX;

            const currentTime = clamp(
              video.currentTime,
              0,
              video.duration,
              // newTime[cur][0],
              // newTime[cur][1],
            );
            setCurrentTime(currentTime);
            video.currentTime = currentTime;
          }
          break;
        case 'left':
          newTime[cur][0] = Math.min(
            relativeX,
            Math.max(newTime[cur][1] - MIN_DURATION, 0),
          );
          if (
            Math.abs(newTime[cur][0] - currentTime) <=
            video.duration * DURATION_SNAP_FACTOR
          ) {
            newTime[cur][0] = currentTime;
          }

          video.currentTime = newTime[cur][0] + 0.01;
          break;
        case 'right':
          newTime[cur][1] = Math.max(
            relativeX,
            Math.min(newTime[cur][0] + MIN_DURATION, video.duration),
          );
          if (
            Math.abs(newTime[cur][1] - currentTime) <=
            video.duration * DURATION_SNAP_FACTOR
          ) {
            newTime[cur][1] = currentTime;
          }

          video.currentTime = newTime[cur][1];
          break;
        case 'seek':
          {
            const currentTime = clamp(
              relativeX,
              0,
              video.duration,
              // state.time![0],
              // state.time![1],
            );
            setCurrentTime(currentTime);
            video.currentTime = currentTime;
          }
          break;
      }

      onChange(newTime);
    },
    onEnd: ({ state }) => {
      ignoreTimeUpdatesRef.current = false;
      if (typeof state.currentTime !== 'undefined') {
        video.currentTime = state.currentTime;
      }

      if (!state.paused) {
        video.play();
      }
    },
  });

  useEffect(() => {
    const update = () => {
      setPlaying(!video.paused);

      if (!ignoreTimeUpdatesRef.current) {
        setCurrentTime(video.currentTime);
      }
    };

    video.addEventListener('pause', update);
    video.addEventListener('playing', update);
    video.addEventListener('play', update);
    video.addEventListener('timeupdate', update);

    return () => {
      video.removeEventListener('pause', update);
      video.removeEventListener('playing', update);
      video.removeEventListener('play', update);
      video.removeEventListener('timeupdate', update);
    };
  }, [video, setPlaying]);

  return (
    <>
      <div className={styles.controls}>
        <button
          onClick={() => {
            if (video.paused) {
              video.play();
            } else {
              video.pause();
            }
          }}
        >
          {playing ? <BsPause /> : <BsPlay />}
        </button>
        <div
          className={styles.timeline}
          ref={timelineRef}
          {...dragProps({
            direction: 'seek',
            paused: video.paused,
          })}
        >
          {/* Segments */}
          {trimTime.map((segmentTime, index) => (
            <div
              className={styles.range}
              key={`segment-${index}`}
              style={{
                left: `${vidPercent(video, segmentTime[0])}%`,
                right: `${100 - vidPercent(video, segmentTime[1])}%`,
              }}
              {...dragProps({
                id: index,
                direction: 'move',
                time: segmentTime,
                paused: video.paused,
              })}
            >
              <button
                className={styles.splitButton}
                onClick={() => handleSplitSegment(index)}
                title="Split segment in half"
              >
                <BsVr />
              </button>
              <button
                className={styles.deleteSegmentButton}
                onClick={() => handleDeleteSegment(index)}
                title="Delete segment"
              >
                <BsFileX />
              </button>
              <div
                className={clsx(styles.handleLeft, {
                  [styles.active]: dragState?.direction,
                })}
                data-time={humanTime(segmentTime[0])}
                {...dragProps({
                  id: index,
                  direction: 'left',
                  currentTime,
                  paused: video.paused,
                })}
              />
              <div
                className={clsx(styles.handleRight, {
                  [styles.active]: dragState?.direction,
                })}
                data-time={humanTime(segmentTime[1])}
                {...dragProps({
                  id: index,
                  direction: 'right',
                  currentTime,
                  paused: video.paused,
                })}
              />
            </div>
          ))}

          {/* Current Time */}
          <div
            className={clsx(styles.current, {
              [styles.active]: dragState?.direction === 'seek',
            })}
            style={{
              left: `${(currentTime / video.duration) * 100}%`,
            }}
            // {...dragProps({
            //   direction: 'seek',
            //   // time: trimTime[0],
            //   paused: video.paused,
            // })}
            data-time={humanTime(currentTime)}
          ></div>
        </div>
      </div>
    </>
  );
};
