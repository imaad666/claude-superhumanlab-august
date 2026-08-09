import type { GuideSession, SessionSample } from "../sessionTypes";
import type { TranscriptWord } from "../types";

const DB_NAME = "speak-and-see-takes";
const DB_VERSION = 1;
const TAKES_STORE = "takes";
const TAKE_DATA_STORE = "take-data";

export type RecordingSummary = {
  id: string;
  title: string;
  createdAt: number;
  durationMs: number;
  sampleCount: number;
  lipTrackCount: number;
  wordCount: number;
  transcript: string;
  transcriptSource: GuideSession["transcriptSource"];
  mediaBytes: number;
  mediaMimeType: string | null;
  schemaVersion: 1;
};

type RecordingData = {
  id: string;
  samples: SessionSample[];
  words: TranscriptWord[];
  mediaBlob: Blob | null;
  mediaStartOffsetMs: number;
};

export type SavedRecording = RecordingSummary & RecordingData;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Local recording storage is unavailable"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TAKES_STORE)) {
        db.createObjectStore(TAKES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TAKE_DATA_STORE)) {
        db.createObjectStore(TAKE_DATA_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("Could not open local recording storage"));
    };
  });
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("Could not read local recording storage"));
    };
  });
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Could not save local recording"));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("Local recording storage was cancelled"));
    };
  });
}

function defaultTitle(createdAt: number): string {
  const date = new Date(createdAt);
  return `Take · ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** Save the real A/V blob and the matching local lip/transcript timeline. */
export async function saveRecording(
  session: GuideSession,
  title?: string,
): Promise<RecordingSummary> {
  const createdAt = session.endedAt ?? Date.now();
  const summary: RecordingSummary = {
    id: session.id,
    title: title?.trim() || defaultTitle(createdAt),
    createdAt,
    durationMs: session.durationMs,
    sampleCount: session.samples.length,
    lipTrackCount: session.samples.filter((sample) => sample.landmarks).length,
    wordCount: session.words.length,
    transcript: session.transcript,
    transcriptSource: session.transcriptSource,
    mediaBytes: session.mediaBlob?.size ?? 0,
    mediaMimeType: session.mediaMimeType,
    schemaVersion: 1,
  };
  const data: RecordingData = {
    id: session.id,
    samples: session.samples,
    words: session.words,
    mediaBlob: session.mediaBlob,
    mediaStartOffsetMs: session.mediaStartOffsetMs,
  };

  const db = await openDb();
  try {
    const transaction = db.transaction([TAKES_STORE, TAKE_DATA_STORE], "readwrite");
    transaction.objectStore(TAKES_STORE).put(summary);
    transaction.objectStore(TAKE_DATA_STORE).put(data);
    await completeTransaction(transaction);
    return summary;
  } finally {
    db.close();
  }
}

export async function listRecordings(): Promise<RecordingSummary[]> {
  const db = await openDb();
  try {
    const transaction = db.transaction(TAKES_STORE, "readonly");
    const takes = await readRequest(
      transaction.objectStore(TAKES_STORE).getAll(),
    ) as RecordingSummary[];
    return takes.sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

export async function getRecording(id: string): Promise<SavedRecording | null> {
  const db = await openDb();
  try {
    const transaction = db.transaction([TAKES_STORE, TAKE_DATA_STORE], "readonly");
    const [summary, data] = await Promise.all([
      readRequest(transaction.objectStore(TAKES_STORE).get(id)) as Promise<RecordingSummary | undefined>,
      readRequest(transaction.objectStore(TAKE_DATA_STORE).get(id)) as Promise<RecordingData | undefined>,
    ]);
    if (!summary || !data) return null;
    return { ...summary, ...data };
  } finally {
    db.close();
  }
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb();
  try {
    const transaction = db.transaction([TAKES_STORE, TAKE_DATA_STORE], "readwrite");
    transaction.objectStore(TAKES_STORE).delete(id);
    transaction.objectStore(TAKE_DATA_STORE).delete(id);
    await completeTransaction(transaction);
  } finally {
    db.close();
  }
}
