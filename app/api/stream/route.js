import { NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";
import YTMusic from "ytmusic-api";

const ytmusic = new YTMusic();
let isInitialized = false;

async function ensureInitialized() {
  if (!isInitialized) {
    await ytmusic.initialize();
    isInitialized = true;
  }
}

function buildRequestHeaders() {
  return {
    cookie: process.env.YT_COOKIES || "",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    Referer: "https://music.youtube.com/",
    Origin: "https://music.youtube.com",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const query = searchParams.get("query");

  await ensureInitialized();

  if (query) {
    try {
      const results = await ytmusic.search(query);
      const filtered = results.filter((item) => item.type === "SONG" || item.type === "VIDEO").slice(0, 10);
      return NextResponse.json(filtered, { headers: { "Access-Control-Allow-Origin": "*" } });
    } catch (error) {
      console.error("Search failed", error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
  }

  if (!videoId) {
    return NextResponse.json({ error: "Missing query or videoId" }, { status: 400 });
  }

  try {
    const info = await ytdl.getInfo(videoId, {
      requestOptions: {
        headers: buildRequestHeaders(),
      },
    });

    const format = ytdl.chooseFormat(info.formats, {
      quality: "highestaudio",
      filter: "audioonly",
    });

    const audioStream = ytdl.downloadFromInfo(info, {
      format,
      requestOptions: {
        headers: buildRequestHeaders(),
      },
    });

    const readableStream = new ReadableStream({
      start(controller) {
        audioStream.on("data", (chunk) => controller.enqueue(chunk));
        audioStream.on("end", () => controller.close());
        audioStream.on("error", (error) => controller.error(error));
      },
      cancel() {
        audioStream.destroy();
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": format.mimeType?.split(";")[0] || "audio/webm",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Stream failed", error);
    return NextResponse.json({ error: "Stream failed" }, { status: 500 });
  }
}
