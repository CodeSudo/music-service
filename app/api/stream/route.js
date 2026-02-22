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

  // Handle Search
  if (query) {
    const results = await ytmusic.searchSongs(query);
    return NextResponse.json(results);
  }

  // Handle Streaming Proxy
  if (videoId) {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      // 1. Get stream info
      const info = await ytdl.getInfo(videoUrl, {
        requestOptions: {
          headers: {
            cookie: process.env.YT_COOKIES || '',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }
      });

      // 2. Select audio format
      const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });

      // 3. Create a Node.js PassThrough stream to bridge ytdl and NextResponse
      const audioStream = ytdl(videoUrl, {
        format: format,
        requestOptions: {
          headers: { cookie: process.env.YT_COOKIES || '' }
        }
      });

      // 4. Return as a standard Web Stream
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
        },
      });
    } catch (err) {
      console.error(err);
      return NextResponse.json({ error: "Streaming failed" }, { status: 500 });
    }
  }
}