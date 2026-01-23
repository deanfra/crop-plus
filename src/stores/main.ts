import { FFmpeg } from '@ffmpeg/ffmpeg';
import { makeAutoObservable, reaction, runInAction } from 'mobx';

import { VideoTransform } from '../types';
import { hasAudio, retrieveBlob } from '../utils';

const canUseMT =
  import.meta.env.VITE_ENABLE_MT === '1' && 'SharedArrayBuffer' in window;
const ffmpegVersion = '0.12.10';
const ffmpegName = canUseMT ? 'core-mt' : 'core';
const ffmpegWorker = canUseMT ? 'ffmpeg-core.worker.js' : undefined;
const ffmpegBaseURL = `https://unpkg.com/@ffmpeg/${ffmpegName}@${ffmpegVersion}/dist/esm`;

class FfmpegStore {
  loaded = false;
  loadProgress = 0;
  ffmpeg = new FFmpeg();

  running = false;
  execProgress = 0;
  outputUrl: string | undefined = undefined;
  output: string = '';
  log: string = '';

  onLoadCallback: (() => void) | undefined = undefined;

  constructor() {
    makeAutoObservable(this);

    this.ffmpeg.on('log', e => {
      console.log(e);
      runInAction(() => {
        this.output = e.message;
        this.log += `${e.message}\n`;
      });
    });

    this.ffmpeg.on('progress', e => {
      runInAction(() => {
        this.execProgress = e.progress;
      });
    });
  }

  async load() {
    // toBlobURL is used to bypass CORS issue, urls with the same
    // domain can be used directly.
    await this.ffmpeg.load({
      coreURL: await retrieveBlob(
        `${ffmpegBaseURL}/ffmpeg-core.js`,
        'text/javascript',
      ),
      wasmURL: await retrieveBlob(
        `${ffmpegBaseURL}/ffmpeg-core.wasm`,
        'application/wasm',
        progress => {
          runInAction(() => {
            this.loadProgress = progress;
          });
        },
      ),
      workerURL: ffmpegWorker
        ? await retrieveBlob(
            `${ffmpegBaseURL}/${ffmpegWorker}`,
            'text/javascript',
          )
        : undefined,
    });

    runInAction(() => {
      this.loadProgress = 1;
      this.loaded = true;

      if (this.onLoadCallback) {
        this.onLoadCallback();
        this.onLoadCallback = undefined;
      }
    });
  }

  async exec(file: File, args: string[]) {
    this.running = true;
    this.execProgress = 0;
    this.output = '';

    try {
      // console.log('writeFile', args);

      await this.ffmpeg.writeFile(
        'input',
        new Uint8Array(await file.arrayBuffer()),
      );
      await this.ffmpeg.exec([...args, 'output.mp4']);

      const data = (await this.ffmpeg.readFile('output.mp4')) as Uint8Array;
      return new File([data.buffer], 'output.mp4', { type: 'video/mp4' });
    } finally {
      try {
        await this.ffmpeg.deleteFile('input');
      } catch {
        //
      }
      try {
        await this.ffmpeg.deleteFile('output.mp4');
      } catch {
        //
      }

      runInAction(() => {
        this.running = false;
      });
    }
  }

  cancel() {
    this.ffmpeg.terminate();
    this.load();
  }
}

class MainStore {
  file: File | undefined = undefined;
  fileLoading = false;
  transform: VideoTransform = {};
  hasAudio = true;

  ffmpeg = new FfmpegStore();

  step = 0;
  video: HTMLVideoElement | undefined = undefined;

  constructor() {
    makeAutoObservable(this);
    this.ffmpeg.load();

    reaction(
      () => [this.step],
      () => this.video?.pause(),
    );
  }

  reset() {
    this.transform = {};

    if (this.video) {
      this.video.pause();
      this.video.currentTime = 0.1;
    }
  }

  async loadVideo(file: File) {
    this.video?.pause();
    this.video = undefined;
    this.file = file;
    this.fileLoading = true;
    this.ffmpeg.onLoadCallback = undefined;
    this.reset();

    const video = document.createElement('video');
    if (!video.canPlayType(file.type)) {
      const remux = async () => {
        const newFile = await this.ffmpeg.exec(file, [
          '-c:v',
          'copy',
          '-c:a',
          'copy',
        ]);
        if (newFile) {
          this.loadVideo(newFile);
        } else {
          // TODO: Error handling.
          runInAction(() => {
            this.fileLoading = false;
          });
        }
      };
      if (this.ffmpeg.loaded) {
        remux();
      } else {
        this.ffmpeg.onLoadCallback = remux;
      }
      return;
    }

    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    video.autoplay = false;

    // Required when using a Service Worker on iOS Safari.
    video.crossOrigin = 'anonymous';

    video.addEventListener('loadedmetadata', () => {
      runInAction(() => {
        video.currentTime = 0.01;
        this.video = video;
      });
    });

    video.addEventListener('canplay', () => {
      this.hasAudio = hasAudio(video);

      if (this.fileLoading) {
        this.fileLoading = false;
        this.step = 1;
      }
    });

    video.addEventListener('ended', () => {
      const start = this.transform.time?.[0][0] || 0;
      video.currentTime = start;
    });

    video.addEventListener('timeupdate', () => {
      // const start = this.transform.time?.[0][0] || 0;
      // const end = this.transform.time?.[0][1] || video.duration;
      const start = 0;
      const end = video.duration;

      if (video.currentTime > end) {
        video.currentTime = start;
      } else if (video.currentTime < start - 1) {
        video.currentTime = start;
      }
    });

    video.src = URL.createObjectURL(file);
  }
}

export const mainStore = new MainStore();
