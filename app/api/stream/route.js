import { NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";
import YTMusic from "ytmusic-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ytmusic = new YTMusic();
let isInitialized = false;

async function ensureInitialized() {
  if (!isInitialized) {
    await ytmusic.initialize({
      cookies: process.env.YT_COOKIES,
      GL: "US",
      HL: "en",
    });
    isInitialized = true;
  }
}

function buildRequestHeaders() {
  return {
    cookie: process.env.YT_COOKIES || "",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    Referer: "https://music.youtube.com/",
    Origin: "https://music.youtube.com",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "x-youtube-client-name": "67",
    "x-youtube-client-version": "1.20260318.00.00",
  };
}

function choosePlayableAudioFormat(formats) {
  const audioFormats = formats.filter((format) => format.hasAudio && !format.hasVideo && !format.isHLS);

  return (
    audioFormats.find((format) => format.container === "m4a") ||
    audioFormats.find((format) => format.mimeType?.includes("audio/mp4")) ||
    audioFormats.find((format) => format.codecs?.includes("mp4a")) ||
    ytdl.chooseFormat(audioFormats, {
      quality: "highestaudio",
      filter: "audioonly",
    })
  );
}

function parseRangeHeader(rangeHeader, contentLength) {
  if (!rangeHeader?.startsWith("bytes=") || !contentLength) {
    return null;
  }

  const [startText, endText] = rangeHeader.replace("bytes=", "").split("-");
  const start = Number.parseInt(startText || "0", 10);
  const requestedEnd = endText ? Number.parseInt(endText, 10) : contentLength - 1;

  if (Number.isNaN(start) || Number.isNaN(requestedEnd) || start < 0 || start >= contentLength) {
    return null;
  }

  const end = Math.min(requestedEnd, contentLength - 1);
  return end >= start ? { start, end } : null;
}

function createReadableStream(audioStream) {
  return new ReadableStream({
    start(controller) {
      audioStream.on("data", (chunk) => controller.enqueue(chunk));
      audioStream.on("end", () => controller.close());
      audioStream.on("error", (error) => controller.error(error));
    },
    cancel() {
      audioStream.destroy();
    },
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const query = searchParams.get("query");

  if (query) {
    try {
      await ensureInitialized();
      const results = await ytmusic.search(query);
      const filtered = results.filter((item) => item.type === "SONG" || item.type === "VIDEO").slice(0, 10);
      return NextResponse.json(filtered, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("Search failed", error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
  }

  if (!videoId) {
    return NextResponse.json({ error: "Missing query or videoId" }, { status: 400 });
  }

  try {
    const requestHeaders = buildRequestHeaders();
    const info = await ytdl.getInfo(`https://music.youtube.com/watch?v=${videoId}`, {
      requestOptions: {
        headers: requestHeaders,
      },
      playerClients: ["WEB_EMBEDDED", "IOS", "ANDROID", "TV"],
    });

    const format = choosePlayableAudioFormat(info.formats);
    if (!format) {
      return NextResponse.json({ error: "No playable audio format found" }, { status: 404 });
    }

    const contentLength = Number.parseInt(format.contentLength || "0", 10);
    const requestedRange = parseRangeHeader(request.headers.get("range"), contentLength);

    const audioStream = ytdl.downloadFromInfo(info, {
      format,
      range: requestedRange || undefined,
      requestOptions: {
        headers: requestHeaders,
      },
      playerClients: ["WEB_EMBEDDED", "IOS", "ANDROID", "TV"],
    });

    const headers = {
      "Content-Type": format.mimeType?.split(";")[0] || "audio/webm",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": "bytes",
    };

    if (requestedRange && contentLength > 0) {
      headers["Content-Length"] = String(requestedRange.end - requestedRange.start + 1);
      headers["Content-Range"] = `bytes ${requestedRange.start}-${requestedRange.end}/${contentLength}`;

      return new NextResponse(createReadableStream(audioStream), {
        status: 206,
        headers,
      });
    }

    if (contentLength > 0) {
      headers["Content-Length"] = String(contentLength);
    }

    return new NextResponse(createReadableStream(audioStream), {
      headers,
    });
  } catch (error) {
    console.error("Stream failed", error);
    return NextResponse.json(
      {
        error: "Stream failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
