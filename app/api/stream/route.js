import { NextResponse } from "next/server";
import { createRequire } from "module";
import YTMusic from "ytmusic-api";

// Import ytdl through the CJS shim that patches fs.writeFile first.
// Direct ESM import of @distube/ytdl-core hoists before any patch code runs,
// so the EROFS debug-file write can't be intercepted that way.
const require = createRequire(import.meta.url);
const ytdl = require("./ytdl-patched.cjs");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ytmusic = new YTMusic();
let isInitialized = false;

const proxyAgent = process.env.PROXY_URL
  ? ytdl.createProxyAgent({ uri: process.env.PROXY_URL })
  : null;

async function ensureInitialized() {
  if (!isInitialized) {
    await ytmusic.initialize({ cookies: process.env.YT_COOKIES });
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
  const audioFormats = formats.filter(
    (f) => f.hasAudio && !f.hasVideo && !f.isHLS
  );
  return (
    audioFormats.find((f) => f.container === "m4a") ||
    audioFormats.find((f) => f.mimeType?.includes("audio/mp4")) ||
    audioFormats.find((f) => f.codecs?.includes("mp4a")) ||
    ytdl.chooseFormat(audioFormats, { quality: "highestaudio", filter: "audioonly" })
  );
}

function parseRangeHeader(rangeHeader, contentLength) {
  if (!rangeHeader?.startsWith("bytes=") || !contentLength) return null;
  const rangeValue = rangeHeader.slice("bytes=".length);
  const dashIndex = rangeValue.indexOf("-");
  const startText = rangeValue.slice(0, dashIndex);
  const endText = rangeValue.slice(dashIndex + 1);
  let start, end;
  if (startText === "") {
    const suffixLength = Number.parseInt(endText, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, contentLength - suffixLength);
    end = contentLength - 1;
  } else {
    start = Number.parseInt(startText, 10);
    end = endText ? Number.parseInt(endText, 10) : contentLength - 1;
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= contentLength || end < start) return null;
  return { start, end: Math.min(end, contentLength - 1) };
}

function createReadableStream(audioStream) {
  return new ReadableStream({
    start(controller) {
      audioStream.on("data", (chunk) => controller.enqueue(chunk));
      audioStream.on("end", () => controller.close());
      audioStream.on("error", (err) => controller.error(err));
    },
    cancel() { audioStream.destroy(); },
  });
}

function isGeoRestricted(error) {
  const msg = (error?.message ?? "").toLowerCase();
  const reason = (
    error?.playabilityStatus?.reason ??
    error?.player_response?.playabilityStatus?.reason ?? ""
  ).toLowerCase();
  return (
    msg.includes("not available in your country") ||
    msg.includes("not available in this country") ||
    msg.includes("uploader has not made this video available") ||
    msg.includes("geo") ||
    msg.includes("region") ||
    reason.includes("country") ||
    reason.includes("region") ||
    reason.includes("not available") ||
    error?.statusCode === 410
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const query = searchParams.get("query");

  if (query) {
    try {
      await ensureInitialized();
      const results = await ytmusic.search(query);
      const filtered = results
        .filter((item) => item.type === "SONG" || item.type === "VIDEO")
        .slice(0, 10);
      return NextResponse.json(filtered, {
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
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
    const infoOptions = {
      requestOptions: { headers: requestHeaders },
      playerClients: ["WEB_EMBEDDED", "IOS", "ANDROID", "TV"],
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    };

    const info = await ytdl.getInfo(
      `https://music.youtube.com/watch?v=${videoId}`,
      infoOptions
    );

    const playability = info?.player_response?.playabilityStatus;
    if (playability?.status === "ERROR" || playability?.status === "UNPLAYABLE") {
      const reason = playability?.reason ?? "";
      if (reason.toLowerCase().includes("country") || reason.toLowerCase().includes("region")) {
        return NextResponse.json(
          { error: "geo_restricted", message: reason },
          { status: 451 }
        );
      }
    }

    const format = choosePlayableAudioFormat(info.formats);
    if (!format) {
      return NextResponse.json({ error: "No playable audio format found" }, { status: 404 });
    }

    const contentLength = format.contentLength
      ? Number.parseInt(format.contentLength, 10)
      : null;

    const rangeHeader = request.headers.get("range");
    const range = parseRangeHeader(rangeHeader, contentLength);

    const audioStream = ytdl.downloadFromInfo(info, {
      format,
      requestOptions: { headers: requestHeaders },
      ...(proxyAgent ? { agent: proxyAgent } : {}),
      ...(range ? { range: { start: range.start, end: range.end } } : {}),
    });

    const readableStream = createReadableStream(audioStream);
    const mimeType = format.mimeType?.split(";")[0] || "audio/mp4";

    if (range && contentLength) {
      return new NextResponse(readableStream, {
        status: 206,
        headers: {
          "Content-Type": mimeType,
          "Content-Range": `bytes ${range.start}-${range.end}/${contentLength}`,
          "Content-Length": String(range.end - range.start + 1),
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      });
    }

    return new NextResponse(readableStream, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Stream error:", error?.message);

    if (isGeoRestricted(error)) {
      return NextResponse.json(
        { error: "geo_restricted", message: "This song isn't available in your region." },
        { status: 451 }
      );
    }

    return NextResponse.json(
      {
        error: "Stream failed",
        details: error?.message ?? String(error),
        playabilityStatus: error?.playabilityStatus?.status ?? null,
        playabilityReason: error?.playabilityStatus?.reason ?? null,
      },
      { status: 500 }
    );
  }
}
