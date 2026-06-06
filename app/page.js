"use client";

import { useState, useRef, useCallback } from "react";

export default function MusicPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [status, setStatus] = useState("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const audioRef = useRef(null);
  const currentIndexRef = useRef(-1);
  const queueRef = useRef([]);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 2;

  const syncRefs = (newQueue, newIndex) => {
    queueRef.current = newQueue;
    currentIndexRef.current = newIndex;
  };

  const search = async () => {
    if (!query.trim()) return;
    setStatusMsg("Searching…");
    try {
      const res = await fetch(
        `/api/stream?query=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setStatusMsg("");
    } catch {
      setStatusMsg("Search failed.");
    }
  };

  const playFromQueue = useCallback((index, targetQueue) => {
    const q = targetQueue ?? queueRef.current;
    const track = q[index];
    if (!track || !audioRef.current) return;

    retryCountRef.current = 0;
    syncRefs(q, index);
    setCurrentIndex(index);
    setStatus("loading");
    setStatusMsg(`Loading: ${track.name}`);

    audioRef.current.src = `/api/stream?videoId=${track.videoId}`;
    audioRef.current.load();
    audioRef.current.play().catch(() => {});
  }, []);

  const retryPlayback = useCallback(
    (index, targetQueue) => {
      if (retryCountRef.current >= MAX_RETRIES) {
        setStatus("error");
        setStatusMsg("Playback failed. Skipping…");
        setTimeout(() => handleAutoNext(), 2000);
        return;
      }
      retryCountRef.current += 1;
      setTimeout(() => playFromQueue(index, targetQueue), 1500);
    },
    [playFromQueue]
  );

  const handleAutoNext = useCallback(() => {
    const q = queueRef.current;
    const next = currentIndexRef.current + 1;
    if (next < q.length) {
      playFromQueue(next, q);
    } else {
      syncRefs(q, -1);
      setCurrentIndex(-1);
      setStatus("idle");
      setStatusMsg("Queue finished.");
    }
  }, [playFromQueue]);

  // FIX (geo): Intercept the audio element's error event and check whether
  // the server returned a 451 (geo-restricted) before doing a retry.
  const handleAudioError = useCallback(async () => {
    const src = audioRef.current?.src;
    if (src) {
      try {
        const res = await fetch(src, { method: "HEAD" });
        if (res.status === 451) {
          const track = queueRef.current[currentIndexRef.current];
          setStatus("error");
          setStatusMsg(
            `"${track?.name ?? "This song"}" isn't available in your region. Skipping…`
          );
          setTimeout(() => handleAutoNext(), 3000);
          return;
        }
      } catch {
        // HEAD request failed — fall through to normal retry
      }
    }
    retryPlayback(currentIndexRef.current, queueRef.current);
  }, [retryPlayback, handleAutoNext]);

  // FIX (P1): Play the newly added track, not index 0, when queue was idle.
  const addToQueue = (track) => {
    const newQueue = [...queueRef.current, track];
    const addedIndex = newQueue.length - 1;
    syncRefs(newQueue, currentIndexRef.current);
    setQueue([...newQueue]);

    if (currentIndexRef.current === -1) {
      playFromQueue(addedIndex, newQueue);
    }
  };

  const clearQueue = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    syncRefs([], -1);
    setQueue([]);
    setCurrentIndex(-1);
    setStatus("idle");
    setStatusMsg("");
  };

  const currentTrack =
    currentIndex >= 0 ? queueRef.current[currentIndex] : null;

  return (
    <main
      style={{
        fontFamily: "sans-serif",
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1rem",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        Stable Stream Pro
      </h1>

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search for a song…"
          style={{ flex: 1, padding: "0.5rem", fontSize: "1rem" }}
        />
        <button
          onClick={search}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          Search
        </button>
      </div>

      {statusMsg && (
        <p
          style={{
            color: status === "error" ? "#c00" : "#555",
            marginBottom: "0.75rem",
            fontSize: "0.9rem",
          }}
        >
          {statusMsg}
        </p>
      )}

      {currentTrack && (
        <div
          style={{
            background: "#f0f4ff",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
          }}
        >
          <strong>Now playing:</strong> {currentTrack.name}
          {currentTrack.artist?.name && ` — ${currentTrack.artist.name}`}
        </div>
      )}

      <audio
        ref={audioRef}
        onPlay={() => {
          setStatus("playing");
          setStatusMsg(
            `Playing: ${queueRef.current[currentIndexRef.current]?.name ?? ""}`
          );
        }}
        onPause={() => setStatus("paused")}
        onEnded={handleAutoNext}
        onError={handleAudioError}
        controls
        style={{ width: "100%", marginBottom: "1rem" }}
      />

      {queue.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <strong>Queue ({queue.length})</strong>
            <button
              onClick={clearQueue}
              style={{ fontSize: "0.8rem", cursor: "pointer", color: "#c00" }}
            >
              Clear
            </button>
          </div>
          {queue.map((track, i) => (
            <div
              key={`${track.videoId}-${i}`}
              onClick={() => playFromQueue(i)}
              style={{
                padding: "0.4rem 0.6rem",
                cursor: "pointer",
                borderRadius: 4,
                background: i === currentIndex ? "#dde8ff" : "transparent",
                fontWeight: i === currentIndex ? 600 : 400,
              }}
            >
              {i + 1}. {track.name}
              {track.artist?.name && (
                <span style={{ color: "#666", fontWeight: 400 }}>
                  {" "}
                  — {track.artist.name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <strong style={{ display: "block", marginBottom: 6 }}>Results</strong>
          {results.map((track) => (
            <div
              key={track.videoId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.4rem 0",
                borderBottom: "1px solid #eee",
              }}
            >
              <span>
                {track.name}
                {track.artist?.name && (
                  <span style={{ color: "#666" }}> — {track.artist.name}</span>
                )}
              </span>
              <button
                onClick={() => addToQueue(track)}
                style={{ marginLeft: 8, cursor: "pointer", fontSize: "0.85rem" }}
              >
                + Queue
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
