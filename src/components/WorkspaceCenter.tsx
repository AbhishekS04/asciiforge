import React, { useRef, useState, useEffect } from 'react';
import { EffectId, Settings } from '../types';

interface WorkspaceCenterProps {
  activeEffect: EffectId;
  settings: Settings;
  originalImage: string | null;
  setOriginalImage: (url: string | null) => void;
  videoElement: HTMLVideoElement | null;
  webcamActive: boolean;
  startWebcam: () => void;
  stopWebcam: () => void;
  loadVideo: (file: File) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  textOutput: string;
  isProcessing: boolean;
  compareMode: boolean;
  setCompareMode: (compare: boolean) => void;
  compareOffset: number;
  setCompareOffset: (offset: number) => void;
  zoom: number;
  setZoom: (z: number) => void;
  pan: { x: number; y: number };
  setPan: (p: { x: number; y: number }) => void;
}

export const WorkspaceCenter: React.FC<WorkspaceCenterProps> = ({
  activeEffect,
  settings,
  originalImage,
  setOriginalImage,
  videoElement,
  webcamActive,
  startWebcam,
  stopWebcam,
  loadVideo,
  canvasRef,
  textOutput,
  isProcessing,
  compareMode,
  setCompareMode,
  compareOffset,
  setCompareOffset,
  zoom,
  setZoom,
  pan,
  setPan
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [isDraggingCompare, setIsDraggingCompare] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Zooming via mouse wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.min(Math.max(nextZoom, 0.1), 10));
  };

  // Click & drag pan mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (compareMode && isDraggingCompare) return;
    if (e.button === 0) { // left click
      setIsDraggingPan(true);
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCompare) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offset = ((e.clientX - rect.left) / rect.width) * 100;
      setCompareOffset(Math.min(Math.max(offset, 0), 100));
      return;
    }

    if (isDraggingPan && dragStart.current) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDraggingPan(false);
    setIsDraggingCompare(false);
  };

  // Drag and Drop files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processUploadedFile(file);
    }
  };

  const processUploadedFile = (file: File) => {
    if (file.type.startsWith('image/')) {
      stopWebcam();
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => {
        if (event.target?.result) {
          setOriginalImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      stopWebcam();
      loadVideo(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const loadDemoImage = (src: string) => {
    stopWebcam();
    setOriginalImage(src);
  };

  // Reset zoom & pan to default
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleFitScreen = () => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas.width === 0 || canvas.height === 0) return;
    const scaleX = (container.clientWidth - 40) / canvas.width;
    const scaleY = (container.clientHeight - 80) / canvas.height;
    const nextZoom = Math.min(scaleX, scaleY, 1);
    if (!isNaN(nextZoom) && isFinite(nextZoom) && nextZoom > 0) {
      setZoom(nextZoom);
      setPan({ x: 0, y: 0 });
    }
  };

  // Automatically fit content to viewport on source change or window/container resizing
  useEffect(() => {
    if (!originalImage && !videoElement && !webcamActive) return;

    // Trigger fit-to-screen with a small timeout to allow layout updates and processing to settle
    const timer = setTimeout(() => {
      handleFitScreen();
    }, 200);

    const handleResize = () => {
      handleFitScreen();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [originalImage, videoElement, webcamActive]);

  // Keybinds for viewport actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.key.toLowerCase()) {
        case '=':
        case '+':
          setZoom(Math.min(zoom * 1.2, 10));
          break;
        case '-':
        case '_':
          setZoom(Math.max(zoom / 1.2, 0.1));
          break;
        case '0':
          handleResetZoom();
          break;
        case 'c':
          setCompareMode(!compareMode);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoom, compareMode]);

  return (
    <div
      ref={containerRef}
      className={`viewport-container ${isDragOver ? 'dropzone-active' : ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Scanline CRT overlay filter */}
      {settings.scanlines > 0 && <div className="scanline-overlay" />}

      {/* Main workspace displays */}
      {originalImage || videoElement || webcamActive ? (
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: isDraggingPan ? 'none' : 'transform 0.1s ease',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isDraggingPan ? 'grabbing' : 'grab',
            userSelect: 'none'
          }}
        >
          {/* Processed canvas viewport (Native Canvas Comparison handles split) */}
          <canvas
            ref={canvasRef}
            className="canvas-viewport-cursor"
            style={{
              display: 'block',
              maxWidth: 'none',
              zIndex: 1
            }}
          />

          {/* Draggable vertical divider */}
          {compareMode && (
            <div
              className="compare-divider"
              style={{
                left: `${compareOffset}%`,
                top: 0,
                bottom: 0,
                position: 'absolute'
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDraggingCompare(true);
              }}
            >
              <div className="compare-handle">⇄</div>
            </div>
          )}
        </div>
      ) : (
        /* Zero Upload State / Brutalist Empty Dashboard */
        <div style={{
          textAlign: 'center',
          maxWidth: '480px',
          padding: '40px 30px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-panel)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          color: 'var(--text-primary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{ fontSize: '26px', fontWeight: '900', marginBottom: '8px', color: 'var(--text-primary)', letterSpacing: '2px' }}>
            ▲ ASCIIFORGE
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '32px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            PREMIUM MONOCHROMATIC ART PIPELINE
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="primary"
              style={{ width: '100%', padding: '12px' }}
            >
              📷 UPLOAD SOURCE IMAGE
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: 'none' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={() => videoInputRef.current?.click()} style={{ padding: '10px' }}>
                📹 LOAD VIDEO
              </button>
              <input
                type="file"
                ref={videoInputRef}
                onChange={handleFileChange}
                accept="video/*"
                style={{ display: 'none' }}
              />

              <button onClick={startWebcam} style={{ padding: '10px' }}>
                🎥 LIVE WEBCAM
              </button>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', letterSpacing: '0.5px' }}>
            — OR DRAG AND DROP SOURCE MEDIA HERE —
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              TEST WITH RETRO SAMPLES:
            </span>
            <div className="demo-gallery">
              <div
                className="demo-item"
                onClick={() => loadDemoImage('https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=400&q=80')}
              >
                <img src="https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=80&q=80" alt="Abstract demo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div className="demo-label">SYNTH</div>
              </div>
              <div
                className="demo-item"
                onClick={() => loadDemoImage('https://images.unsplash.com/photo-1504051771394-dd2e66b2e08f?auto=format&fit=crop&w=400&q=80')}
              >
                <img src="https://images.unsplash.com/photo-1504051771394-dd2e66b2e08f?auto=format&fit=crop&w=80&q=80" alt="Sculpture demo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div className="demo-label">STATUE</div>
              </div>
              <div
                className="demo-item"
                onClick={() => loadDemoImage('https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80')}
              >
                <img src="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=80&q=80" alt="Cyberpunk demo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div className="demo-label">CYBER</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toolbar Controls (Bottom) */}
      {(originalImage || videoElement || webcamActive) && (
        <div className="floating-controls">
          <button onClick={() => setCompareMode(!compareMode)} className={compareMode ? 'active' : ''} title="Split Comparison View (C)">
            ⚖️ {compareMode ? 'COMPARE ON' : 'COMPARE'}
          </button>
          <button onClick={() => setZoom(Math.min(zoom * 1.2, 10))} title="Zoom In (+)">
            ➕
          </button>
          <button onClick={() => setZoom(Math.max(zoom / 1.2, 0.1))} title="Zoom Out (-)">
            ➖
          </button>
          <button onClick={handleResetZoom} title="Reset Scale (0)">
            RESET
          </button>
          <button onClick={handleFitScreen} title="Fit Content to Viewport">
            FIT SCREEN
          </button>

          {webcamActive && (
            <button onClick={stopWebcam} style={{ borderColor: '#ff4444', color: '#ff4444' }}>
              🔴 STOP WEBCAM
            </button>
          )}

          <div style={{ width: '1px', background: 'var(--border-color)', margin: '0 4px' }} />

          <button onClick={() => fileInputRef.current?.click()} title="Upload New Asset">
            📁 FILE
          </button>
        </div>
      )}



      {/* Text Output Drawer for pure character copying */}
      {textOutput && ['ascii-classic', 'ascii-dense', 'ascii-blocks', 'ascii-braille', 'ascii-custom', 'typewriter'].includes(activeEffect) && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          right: '20px',
          width: '260px',
          background: 'var(--bg-panel)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '14px',
          zIndex: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
            CHARACTER CONSOLE
          </div>
          <textarea
            readOnly
            value={textOutput}
            style={{
              height: '100px',
              fontFamily: 'var(--font-courier)',
              fontSize: '8px',
              lineHeight: '1.0',
              whiteSpace: 'pre',
              overflow: 'auto',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)'
            }}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(textOutput);
              alert('Copied to clipboard!');
            }}
            style={{ fontSize: '10px', padding: '6px' }}
          >
            📋 COPY MATRIX
          </button>
        </div>
      )}

      {/* Loading Spinner */}
      {isProcessing && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          backgroundColor: 'var(--bg-panel)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          padding: '8px 14px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          letterSpacing: '1px',
          zIndex: 10,
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
        }}>
          ◳ PROCESSING GPU FRAME...
        </div>
      )}
    </div>
  );
};
