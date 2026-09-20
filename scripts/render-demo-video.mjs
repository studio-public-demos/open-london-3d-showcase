import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "artifacts", "video");
const frames = path.join(workDir, "frames", "frame-%05d.jpg");
const captions = path.join(workDir, "captions.ass");
const outputDir = path.join(root, "assets", "demo-video");
const output = path.join(outputDir, "open-london-3d-drive-demo.mp4");
const duration = 56;

await mkdir(outputDir, { recursive: true });

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Chapter,Segoe UI Semibold,34,&H00F4F7F6,&H000000FF,&HCC07110F,&HBE07110F,-1,0,0,0,100,100,0,0,3,2,0,7,48,48,96,1
Style: Closing,Segoe UI Semibold,42,&H0048D9C5,&H000000FF,&HDD07110F,&HD007110F,-1,0,0,0,100,100,0,0,3,2,0,5,120,120,88,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:04.00,Chapter,,0,0,0,,OPEN LONDON 3D DRIVE\\NAn explainable journey through a real Westminster corridor
Dialogue: 0,0:00:04.00,0:00:13.00,Chapter,,0,0,0,,ROAD-AWARE NAVIGATION\\NOSRM geometry, route guidance, ETA and manoeuvres share one source of truth
Dialogue: 0,0:00:13.00,0:00:21.00,Chapter,,0,0,0,,DRIVER VIEW · DUSK\\NMapLibre owns the camera while the vehicle remains locked to the road
Dialogue: 0,0:00:21.00,0:00:29.00,Chapter,,0,0,0,,ORBIT VIEW · NIGHT\\NOne shared WebGL scene for the map, vehicle and London landmarks
Dialogue: 0,0:00:29.00,0:00:37.00,Chapter,,0,0,0,,PEDESTRIAN VIEW · DAWN\\NFive viewpoints and four authored presentation presets
Dialogue: 0,0:00:37.00,0:00:42.00,Chapter,,0,0,0,,GEOSPATIAL CONTEXT\\N1,904 packaged urban features and four recognisable landmarks
Dialogue: 0,0:00:42.00,0:00:47.00,Chapter,,0,0,0,,EXPLAINABLE DATA\\NBuilding colours reveal measured, inferred and fallback heights
Dialogue: 0,0:00:47.00,0:00:52.00,Chapter,,0,0,0,,LIVE DIAGNOSTICS\\NFrame rate, draw calls, triangles, zoom and feature counts
Dialogue: 0,0:00:52.00,0:00:56.00,Closing,,0,0,0,,OPEN DATA. REAL ROADS. ONE 3D FRAME.\\NA reusable foundation for spatial storytelling and public engagement
`;
await writeFile(captions, ass, "utf8");

const captionPath = path.relative(root, captions).replaceAll("\\", "/").replaceAll(":", "\\:");
const capture = JSON.parse(await readFile(path.join(workDir, "capture.json"), "utf8"));
const frameRate = capture.frameCount / duration;
const music = `0.018*(sin(2*PI*110*t)+0.55*sin(2*PI*164.81*t)+0.35*sin(2*PI*220*t)+0.2*sin(2*PI*329.63*t))`;
const filter = `[0:v]minterpolate=fps=24:mi_mode=blend,tpad=stop_mode=clone:stop_duration=0.5,scale=1920:1080:flags=lanczos:in_range=full:out_range=tv,fade=t=in:st=0:d=0.6,fade=t=out:st=54.8:d=1.2,subtitles=${captionPath},format=yuv420p[v];[1:a]lowpass=f=1200,afade=t=in:st=0:d=2,afade=t=out:st=53:d=3[a]`;

const render = spawnSync("ffmpeg", [
  "-y", "-framerate", frameRate.toFixed(6), "-i", frames,
  "-f", "lavfi", "-i", `aevalsrc=${music}:s=48000:d=${duration}`,
  "-filter_complex", filter,
  "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "160k", "-shortest", output,
], { cwd: root, encoding: "utf8" });

if (render.status !== 0) throw new Error(render.stderr || "FFmpeg render failed");
console.log(`Rendered ${output}`);
