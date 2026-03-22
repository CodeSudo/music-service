"use client";

import { useEffect, useRef, useState } from "react";

const playerShellStyle = {
  background: "#181818",
  padding: "20px",
  borderRadius: "15px",
  marginBottom: "25px",
  border: "1px solid #333",
};

const buttonStyle = {
  flex: 1,
  padding: "10px",
  borderRadius: "8px",
  cursor: "pointer",
  border: "none",
};

export default function MusicPlayer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Search for a song to start listening.");
  const [playbackError, setPlaybackError] = useState("");

  const audioRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const currentIndexRef = useRef(-1);
  const queueRef = useRef([]);
  const retryCountRef = useRef({});

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    return () => {
      clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const getSongStreamUrl = (song) => `/api/stream?videoId=${encodeURIComponent(song.videoId)}`;

  const search = async () => {
    if (!query.trim()) {
      return;
    }

    setLoading(true);
    setStatusMessage(`Searching for “${query.trim()}”...`);

    try {
      const res = await fetch(`/api/stream?query=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      const nextResults = Array.isArray(data) ? data : [];

      setResults(nextResults);
      setStatusMessage(
        nextResults.length
          ? `Found ${nextResults.length} playable result${nextResults.length === 1 ? "" : "s"}.`
          : "No playable results found for that search."
      );
    } catch (err) {
      console.error("Search failed", err);
      setStatusMessage("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const playFromQueue = (index, nextQueue = queueRef.current, attempt = 0) => {
    const audio = audioRef.current;
    const song = nextQueue[index];

    if (!audio || !song) {
      return;
    }

    clearTimeout(retryTimeoutRef.current);
    retryCountRef.current[song.videoId] = attempt;
    setPlaybackError("");
    setCurrentIndex(index);
    setStatusMessage(`Loading ${song.name}...`);

    audio.pause();
    audio.src = getSongStreamUrl(song);
    audio.load();

    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch((err) => {
        console.error("Playback start failed", err);
        setPlaybackError("Playback needs another attempt. Retrying automatically...");
        retryPlayback(song.videoId, index, nextQueue, attempt);
      });
    }
  };

  const retryPlayback = (videoId, index, nextQueue, attempt = 0) => {
    if (attempt >= 1 || nextQueue[index]?.videoId !== videoId) {
      handleAutoNext(`Skipped ${nextQueue[index]?.name || "track"} because it could not be streamed.`);
      return;
    }

    clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = setTimeout(() => {
      playFromQueue(index, nextQueue, attempt + 1);
    }, 1200);
  };

  const handleAutoNext = (message) => {
    const nextQueue = queueRef.current;
    const nextIndex = currentIndexRef.current + 1;

    if (nextIndex < nextQueue.length) {
      if (message) {
        setPlaybackError(message);
      }
      playFromQueue(nextIndex, nextQueue);
      return;
    }

    clearTimeout(retryTimeoutRef.current);
    if (message) {
      setPlaybackError(message);
    }
    setStatusMessage("Queue finished.");
    setCurrentIndex(-1);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
  };

  const instantPlay = (song) => {
    const newQueue = [song];
    setQueue(newQueue);
    queueRef.current = newQueue;
    playFromQueue(0, newQueue);
  };

  const addToQueue = (song) => {
    setQueue((prev) => {
      const newQueue = [...prev, song];
      queueRef.current = newQueue;
      setStatusMessage(`${song.name} added to queue.`);

      if (currentIndexRef.current === -1) {
        playFromQueue(0, newQueue);
      }

      return newQueue;
    });
  };

  const clearQueue = () => {
    clearTimeout(retryTimeoutRef.current);
    setQueue([]);
    queueRef.current = [];
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
    setPlaybackError("");
    setStatusMessage("Queue cleared.");

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
  };

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "760px",
        margin: "auto",
        background: "#0a0a0a",
        color: "#fff",
        minHeight: "100vh",
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ textAlign: "center", color: "#1db954" }}>🎵 Stable Stream Pro</h1>
      <p style={{ textAlign: "center", color: "#a7a7a7", marginTop: "-10px", marginBottom: "24px" }}>
        Search with YouTube Music, then play through your server stream so restricted embeds do not break playback.
      </p>

      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => setStatusMessage(`Now playing ${queueRef.current[currentIndexRef.current]?.name || ""}`.trim())}
        onEnded={() => handleAutoNext()}
        onPause={() => {
          if (currentIndexRef.current >= 0) {
            setStatusMessage(`Paused ${queueRef.current[currentIndexRef.current]?.name || "track"}.`);
          }
        }}
        onError={() => {
          const activeSong = queueRef.current[currentIndexRef.current];
          if (!activeSong) {
            return;
          }

          const attempt = retryCountRef.current[activeSong.videoId] || 0;
          setPlaybackError(`Could not stream ${activeSong.name} on the first attempt. Trying again...`);
          retryPlayback(activeSong.videoId, currentIndexRef.current, queueRef.current, attempt);
        }}
      />

      <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search songs, albums, or videos..."
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "25px",
            border: "none",
            background: "#222",
            color: "#fff",
          }}
        />
        <button
          onClick={search}
          style={{
            background: "#1db954",
            border: "none",
            borderRadius: "25px",
            padding: "0 20px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          {loading ? "..." : "Search"}
        </button>
      </div>

      <div style={{ marginBottom: "24px", color: playbackError ? "#ff9f9f" : "#b3b3b3", minHeight: "24px" }}>
        {playbackError || statusMessage}
      </div>

      {currentSong && (
        <div style={playerShellStyle}>
          <p style={{ margin: "0 0 10px 0", fontSize: "0.9rem", color: "#1db954" }}>Now Playing</p>
          <div style={{ display: "flex", gap: "14px", alignItems: "center", marginBottom: "15px" }}>
            <img
              src={currentSong.thumbnails?.at(-1)?.url || currentSong.thumbnails?.[0]?.url}
              width="64"
              height="64"
              style={{ borderRadius: "12px", objectFit: "cover" }}
              alt={currentSong.name}
            />
            <div>
              <div style={{ fontWeight: "bold", fontSize: "1.1rem", marginBottom: "6px" }}>{currentSong.name}</div>
              <div style={{ color: "#aaa", fontSize: "0.9rem" }}>
                {currentSong.artists?.map((artist) => artist.name).join(", ") || "Unknown artist"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
            <button onClick={() => audioRef.current?.pause()} style={buttonStyle}>
              Pause
            </button>
            <button onClick={() => audioRef.current?.play()} style={buttonStyle}>
              Play
            </button>
            <button onClick={() => handleAutoNext()} style={buttonStyle}>
              Skip
            </button>
            <button
              onClick={clearQueue}
              style={{ ...buttonStyle, background: "#b91d1d", color: "#fff", flex: "0 0 auto", paddingInline: "16px" }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div style={{ ...playerShellStyle, marginBottom: "20px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "10px" }}>Queue</div>
          <ol style={{ margin: 0, paddingLeft: "18px", color: "#bdbdbd" }}>
            {queue.map((song, index) => (
              <li key={`${song.videoId}-${index}`} style={{ marginBottom: "8px", color: index === currentIndex ? "#fff" : "#bdbdbd" }}>
                {song.name}
              </li>
            ))}
          </ol>
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {results.map((song) => (
          <li
            key={song.videoId}
            style={{
              padding: "12px",
              borderBottom: "1px solid #222",
              display: "flex",
              alignItems: "center",
              gap: "15px",
            }}
          >
            <div
              onClick={() => instantPlay(song)}
              style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}
            >
              <img
                src={song.thumbnails?.[0]?.url}
                width="50"
                height="50"
                style={{ borderRadius: "8px", objectFit: "cover" }}
                alt={song.name}
              />
              <div>
                <div style={{ fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {song.name}
                  <span
                    style={{
                      fontSize: "9px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: song.type === "VIDEO" ? "#ff0000" : "#1db954",
                    }}
                  >
                    {song.type}
                  </span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#888" }}>{song.artists?.[0]?.name}</div>
              </div>
            </div>
            <button
              onClick={() => addToQueue(song)}
              style={{ padding: "8px 12px", background: "#333", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}
            >
              + Queue
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
