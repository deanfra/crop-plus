import { get, set } from 'idb-keyval';

type HTMLVideoElementWithAudioCheck = HTMLVideoElement & {
  webkitAudioDecodedByteCount?: number;
  mozHasAudio?: boolean;
  audioTracks?: number[];
};

export const hasAudio = (video: HTMLVideoElementWithAudioCheck): boolean => {
  if (typeof video.webkitAudioDecodedByteCount !== 'undefined') {
    return video.webkitAudioDecodedByteCount > 0;
  } else if (typeof video.mozHasAudio !== 'undefined') {
    return video.mozHasAudio;
  } else if (typeof video.audioTracks !== 'undefined') {
    const audioTracks = video.audioTracks;
    return audioTracks && audioTracks.length > 0;
  }
  return false;
};

export async function retrieveBlob(
  url: string,
  type: string,
  onProgress?: (progress: number) => void,
) {
  let buffer = await get(url);
  if (!buffer) {
    const response = await fetch(url);
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error(`Unable to fetch: ${url}`);
    }

    const contentLength = +response.headers.get('Content-Length')!;
    let receivedLength = 0;
    const chunks = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      receivedLength += value.length;
      onProgress?.(receivedLength / contentLength);
    }

    buffer = await new Blob(chunks).arrayBuffer();

    try {
      set(url, buffer);
      console.log(`Saved to IndexedDB: ${url}`);
    } catch {
      //
    }
  } else {
    console.log(`Loaded from IndexedDB: ${url}`);
  }

  const blob = new Blob([buffer], { type });
  return URL.createObjectURL(blob);
}
