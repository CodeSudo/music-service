import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import YTMusic from 'ytmusic-api';

const ytmusic = new YTMusic();
let initPromise = null;
const searchCache = new Map();
const videoInfoCache = new Map();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes
const STREAM_TIMEOUT = 1000 * 60 * 15; // 15 minute timeout

// Default geolocation (US)
const DEFAULT_COUNTRY = 'US';
const DEFAULT_LANGUAGE = 'en';

// Initialize with US geolocation headers
function initializeYTMusic() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await ytmusic.initialize({
          headers: {
            'GL': DEFAULT_COUNTRY,
            'HL': DEFAULT_LANGUAGE,
          },
        });

        console.log(`YTMusic initialized for US (en)`);
      } catch (err) {
        initPromise = null;
        throw err;
      }
    })();
  }
  return initPromise;
}

// Cache wrapper
function getCached(cache, key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCached(cache, key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Input validation
function validateVideoId(id) {
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id);
}

function validateQuery(query) {
  return query && query.trim().length > 0 && query.trim().length <= 200;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');
    const query = searchParams.get('query');

    // Initialize YTMusic
    await initializeYTMusic();

    // Handle Search
    if (query) {
      if (!validateQuery(query)) {
        return NextResponse.json(
          { error: 'Invalid query parameter' },
          { status: 400 }
        );
      }

      // Check cache
      const cached = getCached(searchCache, query);
      if (cached) {
        return NextResponse.json({
          ...cached,
          fromCache: true,
        });
      }

      // Search with US geolocation
      const results = await ytmusic.searchSongs(query);
      setCached(searchCache, query, results);

      return NextResponse.json({
        results,
        searchQuery: query,
        fromCache: false,
      });
    }

    // Handle Streaming Proxy
    if (videoId) {
      if (!validateVideoId(videoId)) {
        return NextResponse.json(
          { error: 'Invalid videoId parameter' },
          { status: 400 }
        );
      }

      return await streamAudio(videoId);
    }

    return NextResponse.json(
      { error: 'Missing query or videoId parameter' },
      { status: 400 }
    );
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function streamAudio(videoId) {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Check info cache
    let info = getCached(videoInfoCache, videoId);

    if (!info) {
      info = await ytdl.getInfo(videoUrl, {
        requestOptions: {
          headers: getHeaders(),
        },
      });
      setCached(videoInfoCache, videoId, info);
    }

    // Select format once
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });

    // Get stream with selected format
    const audioStream = ytdl.downloadFromInfo(info, { format });

    // Create ReadableStream with proper backpressure handling
    let isCancelled = false;
    const timeout = setTimeout(() => {
      audioStream.destroy();
      isCancelled = true;
    }, STREAM_TIMEOUT);

    const readableStream = new ReadableStream({
      start(controller) {
        audioStream.on('data', (chunk) => {
          if (!isCancelled) {
            controller.enqueue(chunk);
          }
        });

        audioStream.on('end', () => {
          clearTimeout(timeout);
          controller.close();
        });

        audioStream.on('error', (err) => {
          clearTimeout(timeout);
          console.error('Stream error:', err);
          controller.error(err);
        });
      },

      cancel() {
        clearTimeout(timeout);
        audioStream.destroy();
        isCancelled = true;
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Streaming error:', err);
    return NextResponse.json(
      { error: 'Streaming failed' },
      { status: 500 }
    );
  }
}

function getHeaders() {
  return {
    cookie: process.env.YT_COOKIES || '',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
}
