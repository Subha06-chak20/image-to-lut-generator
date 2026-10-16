import React, { useEffect, useRef, useState } from 'react';
import { loadLUT } from '../services/lut/load';
import { GradeParams } from '../services/gpu/gradeParams';
import { LUTRenderer } from '../services/render/webgl';

interface VideoPanelProps {
  videoSrc: string;
  lutData: string | null;
  /**
   * The grade as shader uniforms. Preferred over `lutData`: the parameters are
   * uploaded once per grade change instead of a lattice being re-sampled and
   * re-uploaded on every playback frame.
   */
  gradeParams?: GradeParams | null;
  onGrabFrame: (dataUrl: string) => void;
  onClose: () => void;
  isProcessing: boolean;
}

interface Thumb {
  time: number;
  url: string;
}

const THUMBS = 10;

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

/**
 * Video mode: realtime LUT preview over playback (WebGL), a seekable frame
 * filmstrip, and frame grabs that feed the still pipeline.
 */
const VideoPanel: React.FC<VideoPanelProps> = ({ videoSrc, lutData, gradeParams, onGrabFrame, onClose, isProcessing }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lutRef = useRef<string | null>(lutData);
  const paramsRef = useRef<GradeParams | null>(gradeParams ?? null);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    lutRef.current = lutData;
  }, [lutData]);

  useEffect(() => {
    paramsRef.current = gradeParams ?? null;
  }, [gradeParams]);

  // Realtime render loop.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let renderer: LUTRenderer | null = null;
    let raf = 0;
    // Only re-upload the grade when it actually changed: the video frame is
    // re-uploaded every tick, but the grade is not.
    let lastParams: GradeParams | null = null;
    let lastLut: string | null | undefined;

    const render = () => {
      if (!renderer) {
        try {
          renderer = new LUTRenderer(canvas);
        } catch {
          renderer = null;
        }
      }
      if (renderer && video.videoWidth) {
        renderer.setImage(video, video.videoWidth, video.videoHeight);
        const p = paramsRef.current;
        if (p) {
          if (p !== lastParams) {
            renderer.setGradeParams(p); // uploads the grade and renders
            lastParams = p;
          } else {
            renderer.render();
          }
        } else {
          if (lutRef.current !== lastLut) {
            renderer.setLUT(loadLUT(lutRef.current));
            lastLut = lutRef.current;
          }
          renderer.render();
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      renderer?.dispose();
    };
  }, []);

  // Build the filmstrip once metadata is available.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoaded = async () => {
      setDuration(video.duration || 0);
      const thumbsOut: Thumb[] = [];
      const tw = 160;
      const th = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * tw)) || 90;
      const tmp = document.createElement('canvas');
      tmp.width = tw;
      tmp.height = th;
      const tctx = tmp.getContext('2d');

      for (let i = 0; i < THUMBS; i++) {
        const t = (video.duration * (i + 0.5)) / THUMBS;
        if (!Number.isFinite(t)) break;
        try {
          await seek(video, t);
          if (tctx) {
            tctx.drawImage(video, 0, 0, tw, th);
            thumbsOut.push({ time: t, url: tmp.toDataURL('image/jpeg', 0.6) });
          }
        } catch {
          break;
        }
      }
      await seek(video, 0);
      setThumbs(thumbsOut);
    };

    const onError = () => setError('This video could not be decoded in the browser.');

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
  }, [videoSrc]);

  const handleGrab = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    onGrabFrame(canvas.toDataURL('image/png'));
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  };

  return (
    <div className="w-full h-full flex flex-col relative">
      <div className="flex-1 min-h-0 relative flex items-center justify-center bg-zinc-950/60">
        <video ref={videoRef} src={videoSrc} className="hidden" crossOrigin="anonymous" playsInline muted />
        <canvas ref={canvasRef} className="max-h-[38dvh] md:max-h-[72vh] max-w-full object-contain" />

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs text-white/80 px-6 text-center">
            {error}
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-40 px-2 py-1 rounded text-[10px] bg-black/50 border border-white/10 text-white/80 hover:text-white"
          title="Close video"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div className="absolute top-3 left-3 z-40 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-md px-2 py-1 border border-white/10">
          <span className="text-[9px] font-mono text-white/60">LIVE · LUT</span>
        </div>
      </div>

      {/* Transport + filmstrip */}
      <div className="shrink-0 border-t border-border bg-card/60 p-3 space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) void v.play();
              else v.pause();
            }}
            className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/80 text-foreground flex items-center justify-center"
            title="Play / Pause"
          >
            <i className="fa-solid fa-play text-[10px]"></i>
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            defaultValue={0}
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = parseFloat(e.target.value);
            }}
            className="flex-1"
          />
          <span className="text-[9px] font-mono text-muted-foreground min-w-[48px] text-right">
            {formatTime(duration)}
          </span>
          <button
            onClick={handleGrab}
            className="px-3 py-1.5 rounded-md text-[10px] font-medium bg-primary text-primary-foreground hover:opacity-90"
            title="Grab current frame as the target still"
          >
            Grab Frame
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {thumbs.map((t) => (
            <button
              key={t.time}
              onClick={() => {
                const v = videoRef.current;
                if (v) v.currentTime = t.time;
              }}
              className="shrink-0 rounded border border-border hover:border-primary overflow-hidden"
              title={formatTime(t.time)}
            >
              <img src={t.url} className="h-12 w-auto" alt="" draggable={false} />
            </button>
          ))}
          {thumbs.length === 0 && !error && (
            <span className="text-[10px] text-muted-foreground">Reading frames…</span>
          )}
        </div>
      </div>

      {isProcessing && (
        <div className="absolute inset-0 z-30 bg-background/40 backdrop-blur-sm flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

export default VideoPanel;
