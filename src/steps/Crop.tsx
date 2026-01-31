import React from 'react';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import {
  BsCheck,
  BsVolumeMute,
  BsSymmetryVertical,
  BsSymmetryHorizontal,
  BsVolumeUp,
  BsArrowCounterclockwise,
  BsPlusSquareDotted,
} from 'react-icons/bs';

import styles from './Crop.module.scss';
import { mainStore } from '../stores/main';
import { VideoCrop } from '../components/VideoCrop';
import { VideoTrim } from '../components/VideoTrim';
import { Time } from '../types';

export const Crop: React.FC = observer(() => {
  const video = mainStore.video;
  if (!video) {
    return (
      <div>
        <span>No video selected.</span>
      </div>
    );
  }

  return (
    <div className={styles.step}>
      <div className={styles.controls}>
        <div>
          <button
            title={mainStore.transform.mute ? 'Unmute' : 'Mute'}
            disabled={!mainStore.hasAudio}
            onClick={() => {
              runInAction(() => {
                const mute = !mainStore.transform.mute;
                mainStore.transform = {
                  ...mainStore.transform,
                  mute,
                };
                video.muted = mute;
              });
            }}
          >
            {mainStore.transform.mute || !mainStore.hasAudio ? (
              <BsVolumeMute />
            ) : (
              <BsVolumeUp />
            )}
          </button>
          <button
            title="Flip horizontally"
            className={mainStore.transform.flipH ? 'active' : ''}
            onClick={() => {
              runInAction(() => {
                const { flipH, area } = mainStore.transform;
                mainStore.transform = {
                  ...mainStore.transform,
                  flipH: !flipH,
                  area: area
                    ? [
                        video.videoWidth - area[2] - area[0],
                        area[1],
                        area[2],
                        area[3],
                      ]
                    : undefined,
                };
              });
            }}
          >
            <BsSymmetryVertical />
          </button>
          <button
            title="Flip vertically"
            className={mainStore.transform.flipV ? 'active' : ''}
            onClick={() => {
              runInAction(() => {
                const { flipV, area } = mainStore.transform;
                mainStore.transform = {
                  ...mainStore.transform,
                  flipV: !flipV,
                  area: area
                    ? [
                        area[0],
                        video.videoHeight - area[3] - area[1],
                        area[2],
                        area[3],
                      ]
                    : undefined,
                };
              });
            }}
          >
            <BsSymmetryHorizontal />
          </button>
          <button
            title="Add segment"
            onClick={() => {
              runInAction(() => {
                const { time } = mainStore.transform;
                mainStore.transform = {
                  ...mainStore.transform,
                  time: time?.length
                    ? fillFirstGap(time, video.duration)
                    : ([[0, video.duration]] as Time[]),
                };
              });
            }}
          >
            <BsPlusSquareDotted />
          </button>
        </div>
        <div>
          <button
            onClick={() => {
              mainStore.reset();
            }}
            title="Reset"
          >
            <BsArrowCounterclockwise />
          </button>
          <button
            onClick={() => {
              runInAction(() => {
                video.pause();
                mainStore.step = 2;
              });
            }}
            title="Confirm"
          >
            <BsCheck />
          </button>
        </div>
      </div>
      <VideoTrim
        trimTime={mainStore.transform.time}
        video={video}
        onChange={time => {
          runInAction(() => {
            mainStore.transform = {
              ...mainStore.transform,
              time,
            };
          });
        }}
      />
      <VideoCrop
        transform={mainStore.transform}
        video={video}
        onChange={area =>
          runInAction(() => {
            mainStore.transform = {
              ...mainStore.transform,
              area,
            };
          })
        }
      />
    </div>
  );
});

function fillFirstGap(intervals: Time[], max: number): Time[] {
  if (intervals.length === 0) {
    return [[0, max]];
  }

  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const result: Time[] = [];

  // Gap from 0 to first interval
  const [firstStart] = sorted[0];
  if (firstStart > 0) {
    return [[0, firstStart], ...sorted];
  }

  // Gaps between intervals
  for (let i = 0; i < sorted.length - 1; i++) {
    const [start, end] = sorted[i];
    const [nextStart] = sorted[i + 1];

    result.push([start, end]);

    if (end < nextStart) {
      result.push([end, nextStart]);
      return result.concat(sorted.slice(i + 1));
    }
  }

  // Gap from last interval to max
  const last = sorted[sorted.length - 1];
  if (last[1] < max) {
    return [...sorted, [last[1], max]];
  }

  // No gaps
  return sorted;
}
