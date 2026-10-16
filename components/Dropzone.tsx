
import React, { useState } from 'react';

interface DropzoneProps {
  onUpload: (file: File) => void;
  currentImage: string | null;
  icon: string;
  compact?: boolean;
}

const Dropzone: React.FC<DropzoneProps> = ({ onUpload, currentImage, icon, compact }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) onUpload(e.dataTransfer.files[0]);
  };

  return (
    <div 
      className={`
        relative group transition-all duration-200 rounded-lg border border-dashed overflow-hidden cursor-pointer
        ${compact ? 'h-20' : 'h-32'}
        ${isDragging 
          ? 'bg-accent border-primary' 
          : 'bg-card hover:bg-accent/50 border-border hover:border-muted-foreground/50'}
      `}
      onDragOver={handleDrag}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) onUpload(file);
        };
        input.click();
      }}
    >
      {currentImage ? (
        <div className="w-full h-full relative">
          <img src={currentImage} className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" alt="Preview" />
          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-background/80 backdrop-blur-sm p-1.5 rounded-full border border-border">
              <i className="fa-solid fa-rotate text-xs text-foreground"></i>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
          <i className={`fa-solid ${icon} text-muted-foreground mb-1.5 text-xs`}></i>
          <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">Upload</span>
        </div>
      )}
    </div>
  );
};

export default Dropzone;
