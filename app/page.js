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

  // 1. Initialize Player with "Ghost" visibility for Heartbeat success
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    window.onYouTubeIframeAPIReady = () => {
      playerRef.current = new window.YT.Player('hidden-player', {
        height: '2',
        width: '2',
        videoId: '',
        playerVars: { 
          'autoplay': 1, 
          'controls': 0,
          'enablejsapi': 1,
          'origin': window.location.origin 
        },
        events: {
          'onStateChange': (event) => {
            // Clear watchdog if track starts playing
            if (event.data === window.YT.PlayerState.PLAYING) {
              clearTimeout(watchdogRef.current);
            }
            // Auto-next on end
            if (event.data === window.YT.PlayerState.ENDED) {
              handleAutoNext();
            }
          },
          'onError': (event) => {
            console.error("Player Error:", event.data);
            handleAutoNext(); // Skip restricted tracks (Error 150/101)
          }
        }
      });
    };
  }, []);

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

      // Watchdog: If "Jhol" or others freeze, reset after 5s
      clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        if (playerRef.current?.getPlayerState() !== 1) {
          console.warn("Freeze detected, re-triggering...");
          playerRef.current?.loadVideoById(song.videoId);
        }
      }, 5000);

      if (playerRef.current?.loadVideoById) {
        playerRef.current.loadVideoById(song.videoId);
      }
    }
  };

  const handleAutoNext = () => {
    setQueue((prev) => {
      const nextIndex = currentIndex + 1;
      if (nextIndex < prev.length) {
        playFromQueue(nextIndex, prev);
        setCurrentIndex(nextIndex);
      }
      return prev;
    });
  };

  const instantPlay = (song) => {
    const newQueue = [song];
    setQueue(newQueue);
    setCurrentIndex(0);
    playFromQueue(0, newQueue);
  };

  const addToQueue = (song) => {
    setQueue((prev) => {
      const newQueue = [...prev, song];
      if (currentIndex === -1) {
        setCurrentIndex(0);
        playFromQueue(0, newQueue);
      }
      return newQueue;
    });
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: 'auto', background: '#0a0a0a', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <h1 style={{ textAlign: 'center', color: '#1db954' }}>🎵 Stable Stream Pro</h1>
      
      {/* 🚀 GHOST PLAYER: Technically visible to YouTube but hidden from user */}
      <div id="hidden-player" style={{ position: 'fixed', bottom: '-10px', right: '-10px', opacity: 0.01, zIndex: -1 }}></div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        <input 
          value={query} 
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Search songs or videos..."
          style={{ flex: 1, padding: '12px', borderRadius: '25px', border: 'none', background: '#222', color: '#fff' }}
        />
        <button onClick={search} style={{ background: '#1db954', border: 'none', borderRadius: '25px', padding: '0 20px', cursor: 'pointer', fontWeight: 'bold' }}>
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {/* PLAYER CONTROLS */}
      {currentIndex !== -1 && queue[currentIndex] && (
        <div style={{ background: '#181818', padding: '20px', borderRadius: '15px', marginBottom: '25px', border: '1px solid #333' }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#1db954' }}>Now Playing</p>
          <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '15px' }}>{queue[currentIndex].name}</div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={() => playerRef.current?.pauseVideo()} style={{ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>Pause</button>
            <button onClick={() => playerRef.current?.playVideo()} style={{ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>Play</button>
            <button onClick={handleAutoNext} style={{ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>Skip</button>
            <button onClick={() => { setQueue([]); setCurrentIndex(-1); playerRef.current?.stopVideo(); }} style={{ padding: '10px', background: '#b91d1d', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Clear</button>
          </div>
        </div>
      )}

      {/* RESULTS LIST */}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {results.map((song) => (
          <li key={song.videoId} style={{ padding: '12px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div onClick={() => instantPlay(song)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <img src={song.thumbnails?.[0]?.url} width="50" height="50" style={{ borderRadius: '8px' }} alt="" />
              <div>
                <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {song.name}
                  {/* TYPE BADGE */}
                  <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: song.type === 'VIDEO' ? '#ff0000' : '#1db954' }}>
                    {song.type}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#888' }}>{song.artists?.[0]?.name}</div>
              </div>
            </div>
            <button onClick={() => addToQueue(song)} style={{ padding: '8px 12px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>+ Queue</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
