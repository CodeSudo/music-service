"use client";
import { useState, useEffect, useRef } from 'react';

export default function MusicPlayer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const playerRef = useRef(null);
  const watchdogRef = useRef(null);

  // 1. Function to (Re)Initialize the Player
  const initPlayer = (videoId = '') => {
    // If player exists, destroy it to clear memory leaks
    if (playerRef.current && typeof playerRef.current.destroy === 'function') {
      try { playerRef.current.destroy(); } catch (e) {}
    }

    playerRef.current = new window.YT.Player('hidden-player', {
      height: '0',
      width: '0',
      videoId: videoId,
      playerVars: { 'autoplay': 1, 'controls': 0, 'origin': window.location.origin },
      events: {
        'onReady': (event) => {
          if (videoId) event.target.playVideo();
        },
        'onStateChange': (event) => {
          // Clear watchdog if song actually starts playing
          if (event.data === window.YT.PlayerState.PLAYING) {
            clearTimeout(watchdogRef.current);
          }
          // Handle Auto-Next
          if (event.data === window.YT.PlayerState.ENDED) {
            handleAutoNext();
          }
        },
        'onError': () => {
          console.log("Player Error - Attempting Reset...");
          handleFreezeReset();
        }
      }
    });
  };

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
    window.onYouTubeIframeAPIReady = () => initPlayer();
  }, []);

  // 2. The "Freeze Reset" Logic
  const handleFreezeReset = (targetIndex, currentQueue) => {
    console.warn("Freeze detected. Re-initializing player...");
    const song = currentQueue[targetIndex];
    initPlayer(song.videoId);
  };

  const search = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/stream?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setLoading(false);
    }
  };

  const playFromQueue = (index, currentQueue) => {
    if (index >= 0 && index < currentQueue.length) {
      const song = currentQueue[index];
      setCurrentIndex(index);

      // Start Watchdog: If song doesn't play in 3s, reset the player
      clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        handleFreezeReset(index, currentQueue);
      }, 3000);

      if (playerRef.current && playerRef.current.loadVideoById) {
        playerRef.current.loadVideoById(song.videoId);
        playerRef.current.playVideo();
      } else {
        initPlayer(song.videoId);
      }
    }
  };

  const handleAutoNext = () => {
    setQueue((prevQueue) => {
      setCurrentIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex < prevQueue.length) {
          playFromQueue(nextIndex, prevQueue);
          return nextIndex;
        }
        return prevIndex;
      });
      return prevQueue;
    });
  };

  const instantPlay = (song) => {
    const newQueue = [song];
    setQueue(newQueue);
    playFromQueue(0, newQueue);
  };

  const addToQueue = (song) => {
    setQueue((prev) => {
      const newQueue = [...prev, song];
      if (currentIndex === -1) {
        playFromQueue(0, newQueue);
      }
      return newQueue;
    });
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: 'auto', background: '#111', color: '#fff', minHeight: '100vh' }}>
      <h1>🎵 Stable Stream</h1>
      {/* Container must stay visible for initPlayer to find it, but 0px size */}
      <div id="hidden-player" style={{ position: 'absolute', top: '-1000px' }}></div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          value={query} 
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Search..."
          style={{ flex: 1, padding: '10px', borderRadius: '8px', color: '#000' }}
        />
        <button onClick={search} disabled={loading}>{loading ? '...' : 'Search'}</button>
      </div>

      {currentIndex !== -1 && queue[currentIndex] && (
        <div style={{ background: '#333', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #1db954' }}>
          <p><strong>Playing:</strong> {queue[currentIndex].name}</p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button onClick={() => playerRef.current?.pauseVideo()}>Pause</button>
            <button onClick={() => playerRef.current?.playVideo()}>Play</button>
            <button onClick={handleAutoNext}>Skip</button>
            <button onClick={() => { setQueue([]); setCurrentIndex(-1); playerRef.current?.stopVideo(); }} style={{ background: '#ff4444', color: '#fff', border: 'none', borderRadius: '4px' }}>Clear</button>
          </div>
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {results.map((song) => (
          <li key={song.videoId} 
              style={{ padding: '10px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div onClick={() => instantPlay(song)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <img src={song.thumbnails?.[0]?.url} width="40" height="40" style={{ borderRadius: '4px' }} alt="" />
              <div>
                <div style={{ fontWeight: 'bold' }}>{song.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{song.artists?.[0]?.name}</div>
              </div>
            </div>
            <button onClick={() => addToQueue(song)} style={{ padding: '5px 10px', background: '#1db954', color: '#fff', border: 'none', borderRadius: '4px' }}>+ Queue</button>
          </li>
        ))}
      </ul>
    </div>
  );
}