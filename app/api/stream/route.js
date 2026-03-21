import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import YTMusic from 'ytmusic-api';

const ytmusic = new YTMusic();
let isInitialized = false;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const query = searchParams.get('query');

  if (!isInitialized) {
    await ytmusic.initialize();
    isInitialized = true;
  }

  // 1. Optimized Hybrid Search
  if (query) {
    try {
      const allResults = await ytmusic.search(query); 
      const filtered = allResults
        .filter(item => item.type === 'SONG' || item.type === 'VIDEO')
        .slice(0, 10)
        .map(item => ({
          videoId: item.videoId,
          name: item.name,
          artists: item.artists,
          thumbnails: item.thumbnails,
          type: item.type
        }));

      return NextResponse.json(filtered, { headers: { 'Access-Control-Allow-Origin': '*' } });
    } catch (err) {
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
  }

  // 2. Music-Optimized Streaming Proxy
  if (videoId) {
    try {
      // 🚀 TARGETING MUSIC INFRASTRUCTURE
      const musicUrl = `https://music.youtube.com/watch?v=${videoId}`;
      
      const info = await ytdl.getInfo(musicUrl, {
        requestOptions: {
          headers: {
            cookie: process.env.YT_COOKIES || '',
            // Mimics the YouTube Music Android App for better audio stability
            'User-Agent': 'com.google.android.apps.youtube.music/5.39.52 (Linux; U; Android 12; en_US)',
            'x-youtube-client-name': '5',
            'x-youtube-client-version': '5.39.52'
          }
        }
      });

      // Filter for audio-only formats to save Vercel bandwidth
      const format = ytdl.chooseFormat(info.formats, { 
        filter: 'audioonly', 
        quality: 'highestaudio' 
      });

      const audioStream = ytdl(musicUrl, {
        format: format,
        requestOptions: {
          headers: { 
            cookie: process.env.YT_COOKIES || '',
            'Range': 'bytes=0-' // Ensures the stream starts from the beginning
          }
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
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        },
      });
    } catch (err) {
      console.error(err);
      return NextResponse.json({ error: "Music stream failed" }, { status: 500 });
    }
  }
}
