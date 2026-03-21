import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import YTMusic from 'ytmusic-api';

const ytmusic = new YTMusic();
let isInitialized = false;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const query = searchParams.get('query');

  if (!isInitialized) {
    await ytmusic.initialize();
    isInitialized = true;
  }

  // 1. Hybrid Search remains the same...
  if (query) {
    const results = await ytmusic.search(query);
    const filtered = results
      .filter(item => item.type === 'SONG' || item.type === 'VIDEO')
      .slice(0, 10);
    return NextResponse.json(filtered, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  // 2. 🚀 ALIGNED STREAMING PROXY (Based on your cURL)
  if (videoId) {
    try {
      const musicUrl = `https://music.youtube.com/watch?v=${videoId}`;
      
      const audioStream = ytdl(musicUrl, {
        quality: 'highestaudio',
        filter: 'audioonly',
        requestOptions: {
          headers: {
            cookie: process.env.YT_COOKIES || '',
            // MATCHING YOUR CURL HEADERS EXACTLY:
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
            'Referer': 'https://music.youtube.com/',
            'Origin': 'https://music.youtube.com',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            // Forcing the Music Web Client identity
            'x-youtube-client-name': '67', 
            'x-youtube-client-version': '1.20260318.00.00' 
          }
        }
      });

      // Wrap in Web Stream for Next.js 15+ stability
      const readableStream = new ReadableStream({
        start(controller) {
          audioStream.on('data', (chunk) => controller.enqueue(chunk));
          audioStream.on('end', () => controller.close());
          audioStream.on('error', (err) => controller.error(err));
        },
        cancel() { audioStream.destroy(); }
      });

      return new NextResponse(readableStream, {
        headers: {
          'Content-Type': 'audio/webm', // Your cURL specifically used audio/webm
          'Access-Control-Allow-Origin': '*',
          'Transfer-Encoding': 'chunked',
        },
      });
    } catch (err) {
      return NextResponse.json({ error: "Stream failed" }, { status: 500 });
    }
  }
}
