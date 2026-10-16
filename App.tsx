
import React, { useState, useEffect, useCallback } from 'react';
import { generateLUT, getImageStats, applyLUTToImage } from './services/lutGenerator';
import { Adjustments, INITIAL_ADJUSTMENTS, Stats } from './types';
import Header from './components/Header';
import Dropzone from './components/Dropzone';
import PreviewSection from './components/PreviewSection';
import ControlPanel from './components/ControlPanel';
import AdjustmentsPanel from './components/AdjustmentsPanel';
import LoadingOverlay from './components/LoadingOverlay';

const DEFAULT_SAMPLE_URL = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1200';

const App: React.FC = () => {
  const [refImage, setRefImage] = useState<string | null>(null);
  const [sampleImage, setSampleImage] = useState<string>(DEFAULT_SAMPLE_URL);
  const [lutData, setLutData] = useState<string | null>(null);
  const [lutAnalysis, setLutAnalysis] = useState<{title: string, description: string} | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustments>(INITIAL_ADJUSTMENTS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStats, setCurrentStats] = useState<Stats | null>(null);

  /**
   * Core logic to run the analysis (now purely local).
   */
  const performAnalysis = useCallback(async (
    data: string | null
  ) => {
    if (!data) return;

    setIsProcessing(true);
    try {
      const stats = await getImageStats(data);
      setCurrentStats(stats);
      setLutAnalysis({
        title: "Reference Look",
        description: "Color profile extracted from reference image statistics."
      });
    } catch (err) {
      console.error("Analysis Error:", err);
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
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setSampleImage(base64);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (currentStats) {
      const updateLUT = async () => {
        const lut = await generateLUT(currentStats, adjustments);
        setLutData(lut);
      };
      updateLUT();
    }
  }, [currentStats, adjustments]);

  const handleDownloadLUT = () => {
    if (!lutData) return;
    const blob = new Blob([lutData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lutAnalysis?.title.replace(/\s+/g, '_') || 'S_CHAK_STUDIO'}.cube`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadImage = async () => {
    if (!sampleImage) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = sampleImage;
    
    // Wait for image to load to ensure dimensions are available
    await new Promise((resolve) => {
      if (img.complete) resolve(true);
      else img.onload = () => resolve(true);
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    // Apply the LUT to the full resolution canvas
    applyLUTToImage(canvas, img, lutData);

    const link = document.createElement('a');
    link.download = `S_CHAK_STUDIO_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-background overflow-hidden">
      <Header isProcessing={isProcessing} />
      
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Preview Section - Mobile: Top (40%), Desktop: Right (Flex-1) */}
        <section className="relative w-full h-[45dvh] md:h-full md:flex-1 bg-zinc-950/50 order-1 md:order-2 border-b md:border-b-0 md:border-l border-border">
          <PreviewSection 
            sampleImage={sampleImage} 
            lutData={lutData} 
            isProcessing={isProcessing} 
          />
        </section>

        {/* Sidebar / Controls - Mobile: Bottom (60%), Desktop: Left (360px) */}
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
                <Dropzone onUpload={handleSampleUpload} currentImage={sampleImage === DEFAULT_SAMPLE_URL ? null : sampleImage} icon="fa-clapperboard" compact />
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

            <div className="w-full h-px bg-border"></div>

            {/* Controls */}
            <section>
               <AdjustmentsPanel 
                 values={adjustments} 
                 onChange={(v) => setAdjustments(v)} 
                 disabled={!currentStats}
               />
            </section>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-border bg-card">
            <ControlPanel 
              hasLut={!!lutData} 
              onDownloadLut={handleDownloadLUT}
              onDownloadImage={handleDownloadImage}
              onReset={() => {
                setRefImage(null);
                setSampleImage(DEFAULT_SAMPLE_URL);
                setLutData(null);
                setLutAnalysis(null);
                setCurrentStats(null);
                setAdjustments(INITIAL_ADJUSTMENTS);
              }}
            />
            
            <div className="mt-4 flex justify-center">
                <p className="text-[10px] text-muted-foreground/50">
                    Designed & Built by <a href="https://www.linkedin.com/in/subhadeep-chakraborty-0b8896332/" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">Subhadeep Chakraborty</a>
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
