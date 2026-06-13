"use client";
import { useState, useEffect, useRef } from 'react';

export default function MusicPlayer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', handleAutoNext);
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('ended', handleAutoNext);
      }
    };
  }, []);

  const search = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/stream?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setLoading(false);
    }
  };

  const playSong = (song) => {
    if (audioRef.current && song.videoId) {
      audioRef.current.src = `/api/stream?videoId=${song.videoId}`;
      audioRef.current.play();
    }
  };

  const playFromQueue = (index) => {
    if (index >= 0 && index < queue.length) {
      setCurrentIndex(index);
      playSong(queue[index]);
    }
  };

  const handleAutoNext = () => {
    setCurrentIndex((prev) => {
      const nextIndex = prev + 1;
      if (nextIndex < queue.length) {
        playFromQueue(nextIndex);
      }
      return nextIndex;
    });
  };

  const instantPlay = (song) => {
    const newQueue = [song];
    setQueue(newQueue);
    setCurrentIndex(0);
    playSong(song);
  };

  const addToQueue = (song) => {
    setQueue((prev) => {
      const newQueue = [...prev, song];
      if (currentIndex === -1) {
        setCurrentIndex(0);
        playSong(song);
      }
      return newQueue;
    });
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: 'auto', background: '#111', color: '#fff', minHeight: '100vh' }}>
      <h1>🎵 Music Stream</h1>

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
            <button onClick={() => audioRef.current?.pause()}>Pause</button>
            <button onClick={() => audioRef.current?.play()}>Play</button>
            <button onClick={handleAutoNext}>Skip</button>
            <button 
              onClick={() => { 
                setQueue([]); 
                setCurrentIndex(-1); 
                audioRef.current.pause();
                audioRef.current.src = '';
              }} 
              style={{ background: '#ff4444', color: '#fff', border: 'none', borderRadius: '4px' }}
            >
              Clear
            </button>
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
