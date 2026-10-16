import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { generateLUT, getImageStats, applyLUTToImage } from './services/lutGenerator';
import { buildGradeParams } from './services/gpu/gradeParams';
import { DEFAULT_LUT_SIZE, LUTSize } from './services/lut/build';
import { ColorConfig, DEFAULT_COLOR_CONFIG } from './services/grade/colorConfig';
import { TransferEngineId } from './services/grade/types';
import { Adjustments, INITIAL_ADJUSTMENTS, Stats } from './types';
import { useHistory } from './hooks/useHistory';
import Header from './components/Header';
import Dropzone from './components/Dropzone';
import PreviewSection, { RenderMode } from './components/PreviewSection';
import ControlPanel from './components/ControlPanel';
import GradePanel from './components/GradePanel';
import ColorManagementPanel from './components/ColorManagementPanel';
import TransferEngineSelector from './components/TransferEngineSelector';
import LutSizeSelector from './components/LutSizeSelector';
import ScopesPanel from './components/ScopesPanel';
import VideoPanel from './components/VideoPanel';
import ExportMenu from './components/ExportMenu';
import LoadingOverlay from './components/LoadingOverlay';
import SettingsPanel from './components/SettingsPanel';
import { useSettings } from './hooks/useSettings';

const DEFAULT_SAMPLE_URL = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1200';

/** The complete, undoable grade state. */
interface GradeState {
  adjustments: Adjustments;
  lutSize: LUTSize;
  colorConfig: ColorConfig;
  engine: TransferEngineId;
}

const INITIAL_GRADE: GradeState = {
  adjustments: INITIAL_ADJUSTMENTS,
  lutSize: DEFAULT_LUT_SIZE,
  colorConfig: DEFAULT_COLOR_CONFIG,
  engine: 'reinhard',
};

const App: React.FC = () => {
  const [refImage, setRefImage] = useState<string | null>(null);
  const [sampleImage, setSampleImage] = useState<string>(DEFAULT_SAMPLE_URL);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [lutData, setLutData] = useState<string | null>(null);
  const [lutAnalysis, setLutAnalysis] = useState<{ title: string; description: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStats, setCurrentStats] = useState<Stats | null>(null);
  /** The rendered preview, plus a counter that ticks once per finished frame. */
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [gradeVersion, setGradeVersion] = useState(0);

  const [settings, updateSettings] = useSettings();
  // The backend the viewer reports it is really using (falls back on its own).
  // `pending` means the CPU is wanted but is waiting on a baked LUT, so the
  // shell should bake one without any ungraded frame ever being shown.
  const [renderer, setRenderer] = useState<{ mode: RenderMode; fallback: string | null; pending: boolean }>({
    mode: settings.gpuAcceleration ? 'gpu' : 'cpu',
    fallback: null,
    pending: false,
  });
  const handleRendererChange = useCallback(
    (next: { mode: RenderMode; fallback: string | null; pending: boolean }) => setRenderer(next),
    [],
  );

  const {
    state: grade,
    set: setGrade,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetGrade,
  } = useHistory<GradeState>(INITIAL_GRADE);

  const { adjustments, lutSize, colorConfig, engine } = grade;

  /**
   * Core logic to run the analysis (purely local).
   */
  const performAnalysis = useCallback(async (data: string | null) => {
    if (!data) return;

    setIsProcessing(true);
    try {
      const stats = await getImageStats(data);
      setCurrentStats(stats);
      setLutAnalysis({
        title: 'Reference Look',
        description: 'Color profile extracted from reference image statistics.',
      });
    } catch (err) {
      console.error('Analysis Error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleRefImageUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setRefImage(base64);
      performAnalysis(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSampleUpload = (file: File) => {
    if (file.type.startsWith('video/')) {
      setVideoSrc(URL.createObjectURL(file));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setSampleImage(base64);
      setVideoSrc(null);
    };
    reader.readAsDataURL(file);
  };

  /*
   * The grade as shader uniforms. Building this costs a handful of scalar and
   * matrix derivations plus two small 1D tables (both memoised), so it is cheap
   * enough to recompute on every slider move.
   */
  const gradeParams = useMemo(
    () =>
      currentStats ? buildGradeParams(currentStats, adjustments, colorConfig, engine) : null,
    [currentStats, adjustments, colorConfig, engine],
  );

  /*
   * The baked LUT is only needed by the CPU renderer and by on-demand exports.
   * On the GPU parameter path the preview evaluates the grade from uniforms, so
   * no lattice is baked at all — which is what removes the ~83 ms (33³) /
   * ~590 ms (65³) main-thread stall that used to trail every slider move. The
   * scopes read the rendered canvas and the exports bake on demand, so neither
   * needs the lattice to be sitting around.
   */
  useEffect(() => {
    if (!currentStats) return;
    // Bake when the CPU is painting, or as soon as it is waiting to paint — the
    // GPU path itself never needs a lattice.
    if (renderer.mode === 'gpu' && !renderer.pending) return;
    let cancelled = false;
    void (async () => {
      const lut = await generateLUT(currentStats, adjustments, lutSize, colorConfig, engine);
      if (!cancelled) setLutData(lut);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStats, adjustments, lutSize, colorConfig, engine, renderer.mode, renderer.pending]);

  /** Bake the current grade on demand (exports never reuse a stale lattice). */
  const bakeLut = useCallback(async () => {
    if (!currentStats) return null;
    return generateLUT(currentStats, adjustments, lutSize, colorConfig, engine);
  }, [currentStats, adjustments, lutSize, colorConfig, engine]);

  /** The viewer reports every finished frame; the scopes re-read it from here. */
  const handlePreviewRender = useCallback((canvas: HTMLCanvasElement | null, version: number) => {
    setPreviewCanvas(canvas);
    setGradeVersion(version);
  }, []);

  // Undo / redo keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const handleDownloadLUT = async () => {
    // Always bake from the live settings rather than reusing whichever LUT the
    // renderer last produced, so the exported file can never trail the grade
    // that is on screen.
    const lut = await bakeLut();
    if (!lut) return;
    const blob = new Blob([lut], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lutAnalysis?.title.replace(/\s+/g, '_') || 'S_CHAK_STUDIO'}_${lutSize}.cube`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadImage = async () => {
    if (!sampleImage) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sampleImage;

    await new Promise((resolve) => {
      if (img.complete) resolve(true);
      else img.onload = () => resolve(true);
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const lut = await bakeLut();
    applyLUTToImage(canvas, img, lut);

    const link = document.createElement('a');
    link.download = `S_CHAK_STUDIO_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleReset = () => {
    setRefImage(null);
    setSampleImage(DEFAULT_SAMPLE_URL);
    setVideoSrc(null);
    setLutData(null);
    setLutAnalysis(null);
    setCurrentStats(null);
    resetGrade(INITIAL_GRADE);
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-background overflow-hidden">
      <Header isProcessing={isProcessing} renderMode={renderer.mode} />

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Preview Section - Mobile: Top (40%), Desktop: Right (Flex-1) */}
        <section className="relative w-full h-[45dvh] md:h-full md:flex-1 bg-zinc-950/50 order-1 md:order-2 border-b md:border-b-0 md:border-l border-border flex flex-col">
          <div className="flex-1 min-h-0">
            {videoSrc ? (
              <VideoPanel
                videoSrc={videoSrc}
                lutData={lutData}
                gradeParams={gradeParams}
                isProcessing={isProcessing}
                onGrabFrame={(dataUrl) => {
                  setSampleImage(dataUrl);
                  setVideoSrc(null);
                }}
                onClose={() => setVideoSrc(null)}
              />
            ) : (
              <PreviewSection
                sampleImage={sampleImage}
                lutData={lutData}
                gradeParams={gradeParams}
                isProcessing={isProcessing}
                gpuEnabled={settings.gpuAcceleration}
                onRendererChange={handleRendererChange}
                onRender={handlePreviewRender}
              />
            )}
          </div>
          {!videoSrc && (
            <ScopesPanel
              sampleImage={sampleImage}
              previewCanvas={previewCanvas}
              gradeVersion={gradeVersion}
              referenceImage={refImage}
            />
          )}
        </section>

        {/* Sidebar / Controls - Mobile: Bottom (60%), Desktop: Left (400px) */}
        <aside className="w-full md:w-[400px] h-[55dvh] md:h-full bg-card flex flex-col order-2 md:order-1 z-10 shadow-xl md:shadow-none">
          <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
            {/* Input Section */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Reference</span>
                <Dropzone onUpload={handleRefImageUpload} currentImage={refImage} icon="fa-wand-magic-sparkles" compact />
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Target</span>
                <Dropzone onUpload={handleSampleUpload} currentImage={sampleImage === DEFAULT_SAMPLE_URL ? null : sampleImage} icon="fa-clapperboard" compact accept="image/*,video/*" />
              </div>
            </div>

            {/* Analysis Info */}
            {lutAnalysis && (
              <div className="px-4 py-3 rounded-md bg-secondary border border-border animate-fade-in">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                  <h3 className="text-xs font-semibold text-primary">{lutAnalysis.title}</h3>
                </div>
                <p className="text-[11px] text-muted-foreground italic">"{lutAnalysis.description}"</p>
              </div>
            )}

            <TransferEngineSelector
              value={engine}
              onChange={(v) => setGrade((g) => ({ ...g, engine: v }))}
              disabled={!currentStats}
            />

            <LutSizeSelector
              value={lutSize}
              onChange={(v) => setGrade((g) => ({ ...g, lutSize: v }))}
              disabled={!currentStats}
            />

            <ColorManagementPanel
              value={colorConfig}
              onChange={(v) => setGrade((g) => ({ ...g, colorConfig: v }), 'colormgmt')}
              disabled={!currentStats}
            />

            <SettingsPanel
              gpuEnabled={settings.gpuAcceleration}
              onGpuEnabledChange={(enabled) => updateSettings({ gpuAcceleration: enabled })}
              gpuActive={renderer.mode === 'gpu'}
              fallbackReason={renderer.fallback}
            />

            <div className="w-full h-px bg-border"></div>

            {/* Controls */}
            <section>
              <GradePanel
                values={adjustments}
                onChange={(v) => setGrade((g) => ({ ...g, adjustments: v }), 'adjustments')}
                disabled={!currentStats}
              />
            </section>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-border bg-card">
            <ControlPanel
              canExport={!!currentStats}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              onDownloadLut={handleDownloadLUT}
              onDownloadImage={handleDownloadImage}
              onReset={handleReset}
            />

            <div className="mt-2">
              <ExportMenu
                resolveLut={bakeLut}
                canExport={!!currentStats}
                baseName={(lutAnalysis?.title.replace(/\s+/g, '_') || 'S_CHAK_STUDIO') + `_${lutSize}`}
              />
            </div>

            <div className="mt-4 flex justify-center">
              <p className="text-[10px] text-muted-foreground/50">
                Designed &amp; Built by <a href="https://www.linkedin.com/in/subhadeep-chakraborty-0b8896332/" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">Subhadeep Chakraborty</a>
              </p>
            </div>
          </div>
        </aside>
      </main>

      <LoadingOverlay isVisible={isProcessing} />
    </div>
  );
};

export default App;
