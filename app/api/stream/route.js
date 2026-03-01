import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import YTMusic from 'ytmusic-api';

const ytmusic = new YTMusic();
let isInitialized = false;

// 1. CORS Preflight Handler
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', 
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const query = searchParams.get('query');

  // Lazy initialization of YTMusic
  if (!isInitialized) {
    await ytmusic.initialize();
    isInitialized = true;
  }

  // 🚀 HYBRID SEARCH: Handles "Jhol" and other video-only tracks
  if (query) {
    try {
      // Use general search to find both Songs and Videos
      const allResults = await ytmusic.search(query); 

      // M.Tech Optimization: Filter, Limit to 10, and Shape the data
      const filteredResults = allResults
        .filter(item => item.type === 'SONG' || item.type === 'VIDEO')
        .slice(0, 10) // Limit payload size for Vercel performance
        .map(item => ({
          videoId: item.videoId,
          name: item.name,
          artists: item.artists,
          thumbnails: item.thumbnails,
          type: item.type // Passed to frontend for the [SONG/VIDEO] Badge
        }));

      return NextResponse.json(filteredResults, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    } catch (err) {
      console.error("Search Error:", err);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
  }

  // Handle Streaming Proxy (Note: For videos like "Jhol", IFrame playback is recommended 
  // over this proxy method to avoid Vercel 4.5MB payload limits)
  if (videoId) {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      const info = await ytdl.getInfo(videoUrl, {
        requestOptions: {
          headers: {
            cookie: process.env.YT_COOKIES || '',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }
      });

      const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });

      const audioStream = ytdl(videoUrl, {
        format: format,
        requestOptions: {
          headers: { cookie: process.env.YT_COOKIES || '' }
        }
      });

      const readableStream = new ReadableStream({
        start(controller) {
          audioStream.on('data', (chunk) => controller.enqueue(chunk));
          audioStream.on('end', () => controller.close());
          audioStream.on('error', (err) => controller.error(err));
        },
        cancel() {
          audioStream.destroy();
        }
      });

      return new NextResponse(readableStream, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Transfer-Encoding': 'chunked',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { error: "Streaming failed" }, 
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }
  }
}
