import React from 'react';
import { EffectId, Settings, ColorMode } from '../types';

interface SidebarRightProps {
  activeEffect: EffectId;
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  uiMode: 'simple' | 'advanced' | 'custom';
  setUiMode: (mode: 'simple' | 'advanced' | 'custom') => void;

  // Export props
  originalImage: string | null;
  videoElement: HTMLVideoElement | null;
  webcamActive: boolean;
  exportResult: (format: 'text' | 'html' | 'ansi' | 'svg' | 'png' | 'webp' | 'gif' | 'video' | 'mp3') => void;
  recording: boolean;
  recordingTime: number;
  stopVideoRecording: () => void;
  exportFps: number;
  setExportFps: (fps: number) => void;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
  activeEffect,
  settings,
  updateSettings,
  collapsed,
  setCollapsed,
  uiMode,
  setUiMode,
  originalImage,
  videoElement,
  webcamActive,
  exportResult,
  recording,
  recordingTime,
  stopVideoRecording,
  exportFps,
  setExportFps
}) => {
  const handleSliderChange = (key: keyof Settings, value: number | string | boolean) => {
    updateSettings({ [key]: value });
  };

  const renderSectionHeader = (title: string) => (
    <div className="category-title" style={{ marginTop: '8px', marginBottom: '12px' }}>
      {title}
    </div>
  );

  // Helper to check if the current effect needs a parameter
  const needsParameter = (param: string): boolean => {
    switch (param) {
      case 'charset':
        return activeEffect === 'ascii-custom';
      case 'blockSize':
        return [
          'ascii-classic', 'ascii-dense', 'ascii-blocks', 'ascii-braille',
          'ascii-emoji', 'ascii-custom', 'ascii-color', 'typewriter',
          'halftone-dots', 'halftone-lines', 'crosshatch', 'blockify', 'wave-lines',
          'dots-field', 'noise-field'
        ].includes(activeEffect);
      case 'thresholdValue':
        return ['ascii-braille', 'ascii-edge', 'ascii-box', 'ascii-binary', 'dither-bayer', 'dither-floyd', 'dither-atkinson', 'threshold'].includes(activeEffect);
      case 'edgeStrength':
        return activeEffect === 'contour-edges';
      case 'sortThreshold':
        return activeEffect === 'pixel-sort';
      case 'waveCount':
        return activeEffect === 'wave-lines';
      case 'voronoiCells':
        return ['voronoi', 'stained-glass'].includes(activeEffect);
      case 'noiseScale':
        return ['dots-field', 'noise-field'].includes(activeEffect);
      case 'vhsJitter':
        return activeEffect === 'vhs-glitch';
      case 'paintRadius':
        return activeEffect === 'oil-paint';
      case 'dotShape':
        return activeEffect === 'halftone-dots';
      default:
        return false;
    }
  };

  return (
    <>
      <div className={`panel panel-right ${collapsed ? 'collapsed-right' : ''}`}>
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚙️</span>
            <span style={{ letterSpacing: '1px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>Controls</span>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="panel-collapse-toggle-btn"
            title="Collapse Sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chevron-icon">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>

        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px' }}>
          {/* Segmented Mode Control */}
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', background: 'rgba(255, 255, 255, 0.04)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {(['simple', 'advanced', 'custom'] as const).map((mode) => (
                <button
                  key={mode}
                  className={uiMode === mode ? 'active' : ''}
                  onClick={() => setUiMode(mode)}
                  style={{
                    padding: '6px 2px',
                    fontSize: '9px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: uiMode === mode ? '#ffffff' : 'transparent',
                    color: uiMode === mode ? '#000000' : 'rgba(255, 255, 255, 0.6)',
                    fontWeight: uiMode === mode ? 'bold' : 'normal',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution & Density Scaling - Visible in All Modes */}
          <div>
            {renderSectionHeader('1. Resolution Scale')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {([0.25, 0.5, 1.0, 2.0] as const).map((scale) => (
                <button
                  key={scale}
                  className={settings.resolutionScale === scale ? 'active' : ''}
                  onClick={() => handleSliderChange('resolutionScale', scale)}
                  style={{ padding: '6px 2px', fontSize: '10px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  {scale}x
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Active Effect Parameters */}
          <div>
            {renderSectionHeader('2. Filter Intensity')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {needsParameter('charset') && uiMode === 'custom' && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>CUSTOM CHARACTER MATRIX</span>
                  </div>
                  <input
                    type="text"
                    value={settings.charset}
                    onChange={(e) => handleSliderChange('charset', e.target.value)}
                    maxLength={30}
                    placeholder="Enter mapping characters..."
                    style={{ letterSpacing: '2px', fontSize: '13px', borderRadius: '6px' }}
                  />
                </div>
              )}

              {needsParameter('blockSize') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>CELL/BLOCK SIZE</span>
                    <span className="slider-value">{settings.blockSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="32"
                    step="1"
                    value={settings.blockSize}
                    onChange={(e) => handleSliderChange('blockSize', parseInt(e.target.value))}
                  />
                </div>
              )}

              {needsParameter('dotShape') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>HALFTONE SHAPE</span>
                    <span className="slider-value" style={{ textTransform: 'uppercase' }}>{settings.dotShape}</span>
                  </div>
                  <select
                    value={settings.dotShape || 'circle'}
                    onChange={(e) => handleSliderChange('dotShape', e.target.value as any)}
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      padding: '8px 12px',
                      fontSize: '12px',
                      outline: 'none',
                      fontFamily: "'Courier Prime', monospace",
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      marginTop: '4px'
                    }}
                  >
                    <option value="circle" style={{ background: '#09090b', color: '#fff' }}>🔵 CIRCLE (ROUND)</option>
                    <option value="square" style={{ background: '#09090b', color: '#fff' }}>⬛ SQUARE (BLOCK)</option>
                    <option value="oval" style={{ background: '#09090b', color: '#fff' }}>🥚 OVAL (ELLIPSE)</option>
                    <option value="diamond" style={{ background: '#09090b', color: '#fff' }}>🔶 DIAMOND (RHOMBUS)</option>
                  </select>
                </div>
              )}

              {needsParameter('thresholdValue') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>DITHER THRESHOLD</span>
                    <span className="slider-value">{settings.thresholdValue}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    step="1"
                    value={settings.thresholdValue}
                    onChange={(e) => handleSliderChange('thresholdValue', parseInt(e.target.value))}
                  />
                </div>
              )}

              {needsParameter('edgeStrength') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>EDGE DETECT STRENGTH</span>
                    <span className="slider-value">{settings.edgeStrength}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="8"
                    step="0.1"
                    value={settings.edgeStrength}
                    onChange={(e) => handleSliderChange('edgeStrength', parseFloat(e.target.value))}
                  />
                </div>
              )}

              {needsParameter('sortThreshold') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>BRIGHTNESS SORT LIMIT</span>
                    <span className="slider-value">{settings.sortThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    step="1"
                    value={settings.sortThreshold}
                    onChange={(e) => handleSliderChange('sortThreshold', parseInt(e.target.value))}
                  />
                </div>
              )}

              {needsParameter('waveCount') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>WAVE CONTOUR COUNT</span>
                    <span className="slider-value">{settings.waveCount}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={settings.waveCount}
                    onChange={(e) => handleSliderChange('waveCount', parseInt(e.target.value))}
                  />
                </div>
              )}

              {needsParameter('voronoiCells') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>CELL/MOSAIC COUNT</span>
                    <span className="slider-value">{settings.voronoiCells}</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="25"
                    value={settings.voronoiCells}
                    onChange={(e) => handleSliderChange('voronoiCells', parseInt(e.target.value))}
                  />
                </div>
              )}

              {needsParameter('noiseScale') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>VECTOR FIELD NOISE SCALE</span>
                    <span className="slider-value">{settings.noiseScale}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="300"
                    step="10"
                    value={settings.noiseScale}
                    onChange={(e) => handleSliderChange('noiseScale', parseInt(e.target.value))}
                  />
                </div>
              )}

              {needsParameter('vhsJitter') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>VHS TAPE JITTER</span>
                    <span className="slider-value">{settings.vhsJitter}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="5.0"
                    step="0.1"
                    value={settings.vhsJitter}
                    onChange={(e) => handleSliderChange('vhsJitter', parseFloat(e.target.value))}
                  />
                </div>
              )}

              {needsParameter('paintRadius') && (
                <div className="slider-group">
                  <div className="slider-label">
                    <span>PAINT SMEAR RADIUS</span>
                    <span className="slider-value">{settings.paintRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="1"
                    value={settings.paintRadius}
                    onChange={(e) => handleSliderChange('paintRadius', parseInt(e.target.value))}
                  />
                </div>
              )}

              {!['charset', 'blockSize', 'dotShape', 'thresholdValue', 'edgeStrength', 'matrixSpeed', 'sortThreshold', 'waveCount', 'voronoiCells', 'noiseScale', 'vhsJitter', 'paintRadius'].some(needsParameter) && (
                <div style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '11px', fontStyle: 'italic', padding: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                  This effect relies fully on global adjustments.
                </div>
              )}
            </div>
          </div>

          {/* Custom Mode Color Mapping Controls */}
          {uiMode === 'custom' && (
            <div>
              {renderSectionHeader('3. Brutalist Color Modes')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="toggle-group" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)' }}>COLOR MAP DESIGN</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                    {(['original', 'mono', 'palette', 'gradient'] as ColorMode[]).map((mode) => (
                      <button
                        key={mode}
                        className={settings.colorMode === mode ? 'active' : ''}
                        onClick={() => handleSliderChange('colorMode', mode)}
                        style={{ padding: '6px 2px', fontSize: '9px', textTransform: 'uppercase', borderRadius: '6px' }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {settings.colorMode === 'mono' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>INK (FG)</span>
                      <input
                        type="color"
                        value={settings.monoFg}
                        onChange={(e) => handleSliderChange('monoFg', e.target.value)}
                        style={{ width: '100%', height: '32px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', borderRadius: '4px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>PAPER (BG)</span>
                      <input
                        type="color"
                        value={settings.monoBg}
                        onChange={(e) => handleSliderChange('monoBg', e.target.value)}
                        style={{ width: '100%', height: '32px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', borderRadius: '4px' }}
                      />
                    </div>
                  </div>
                )}

                {settings.colorMode === 'gradient' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>START</span>
                      <input
                        type="color"
                        value={settings.gradientStart}
                        onChange={(e) => handleSliderChange('gradientStart', e.target.value)}
                        style={{ width: '100%', height: '32px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', borderRadius: '4px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>END</span>
                      <input
                        type="color"
                        value={settings.gradientEnd}
                        onChange={(e) => handleSliderChange('gradientEnd', e.target.value)}
                        style={{ width: '100%', height: '32px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', borderRadius: '4px' }}
                      />
                    </div>
                  </div>
                )}

                {settings.colorMode === 'palette' && (
                  <div style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                    <div className="slider-group" style={{ margin: 0 }}>
                      <div className="slider-label">
                        <span>COLOR BINS</span>
                        <span className="slider-value">{settings.paletteSize} COLORS</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '4px' }}>
                        {([2, 4, 8, 16] as const).map((size) => (
                          <button
                            key={size}
                            className={settings.paletteSize === size ? 'active' : ''}
                            onClick={() => handleSliderChange('paletteSize', size)}
                            style={{ padding: '4px', fontSize: '10px', borderRadius: '4px' }}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chromatic CRT Artifacts - Advanced and Custom Modes Only */}
          {uiMode !== 'simple' && (
            <div>
              {renderSectionHeader('4. Chromatic CRT Artifacts')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="slider-group">
                  <div className="slider-label">
                    <span>CHROMATIC SPLIT</span>
                    <span className="slider-value">{settings.chromaticAberration}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    step="1"
                    value={settings.chromaticAberration}
                    onChange={(e) => handleSliderChange('chromaticAberration', parseInt(e.target.value))}
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>SCREEN SCANLINES</span>
                    <span className="slider-value">{settings.scanlines}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.scanlines}
                    onChange={(e) => handleSliderChange('scanlines', parseInt(e.target.value))}
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>ANALOG FILM GRAIN</span>
                    <span className="slider-value">{settings.filmGrain}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.filmGrain}
                    onChange={(e) => handleSliderChange('filmGrain', parseInt(e.target.value))}
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>CRT CORNER VIGNETTE</span>
                    <span className="slider-value">{settings.vignette}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.vignette}
                    onChange={(e) => handleSliderChange('vignette', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Global Image Tuners - Advanced and Custom Modes Only */}
          {uiMode !== 'simple' && (
            <div>
              {renderSectionHeader('5. Global Contrast & Light')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="slider-group">
                  <div className="slider-label">
                    <span>BRIGHTNESS</span>
                    <span className="slider-value">{settings.brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={settings.brightness}
                    onChange={(e) => handleSliderChange('brightness', parseInt(e.target.value))}
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>CONTRAST</span>
                    <span className="slider-value">{settings.contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={settings.contrast}
                    onChange={(e) => handleSliderChange('contrast', parseInt(e.target.value))}
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>GAMMA TUNER</span>
                    <span className="slider-value">{settings.gamma}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.05"
                    value={settings.gamma}
                    onChange={(e) => handleSliderChange('gamma', parseFloat(e.target.value))}
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>EDGE SHARPEN</span>
                    <span className="slider-value">{settings.sharpen}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="5.0"
                    step="0.1"
                    value={settings.sharpen}
                    onChange={(e) => handleSliderChange('sharpen', parseFloat(e.target.value))}
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-label" style={{ color: 'var(--accent-purple)' }}>
                    <span>⚡ COLOR VIBRANCE BOOST</span>
                    <span className="slider-value" style={{ color: 'var(--accent-purple)' }}>{settings.colorBoost ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={settings.colorBoost ?? 0}
                    onChange={(e) => handleSliderChange('colorBoost', parseInt(e.target.value))}
                    style={{ accentColor: 'var(--accent-purple)' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                  <button
                    className={settings.invert ? 'active' : ''}
                    onClick={() => handleSliderChange('invert', !settings.invert)}
                    style={{ padding: '6px', fontSize: '10px', borderRadius: '6px' }}
                  >
                    {settings.invert ? '✓ INVERTED' : 'INVERT COLORS'}
                  </button>
                  <button
                    className={settings.grayscale ? 'active' : ''}
                    onClick={() => handleSliderChange('grayscale', !settings.grayscale)}
                    style={{ padding: '6px', fontSize: '10px', borderRadius: '6px' }}
                  >
                    {settings.grayscale ? '✓ GRAYSCALE' : 'FORCE MONO'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 6. Export Studio */}
          {(originalImage || videoElement || webcamActive) && (
            <div>
              {renderSectionHeader('6. Export Studio')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button onClick={() => exportResult('png')} className="primary" style={{ padding: '8px', fontSize: '10.5px' }}>
                    💾 PNG IMAGE
                  </button>
                  <button onClick={() => exportResult('webp')} style={{ padding: '8px', fontSize: '10.5px' }}>
                    💾 WEBP IMAGE
                  </button>
                </div>

                {/* Video Export button */}
                {(videoElement || webcamActive) ? (
                  recording ? (
                    <button
                      onClick={stopVideoRecording}
                      style={{
                        padding: '10px',
                        fontSize: '11px',
                        backgroundColor: '#ff4444',
                        color: '#ffffff',
                        borderColor: '#ff4444',
                        fontWeight: 'bold',
                        animation: 'pulse 1.5s infinite',
                        cursor: 'pointer'
                      }}
                    >
                      🔴 STOP & SAVE VIDEO ({recordingTime}s)
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ marginBottom: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.7, color: '#ffffff' }}>
                          Export FPS: {exportFps} FPS
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                          {[15, 24, 30, 60].map((f) => (
                            <button
                              key={f}
                              onClick={() => setExportFps(f)}
                              style={{
                                padding: '4px 2px',
                                fontSize: '9px',
                                backgroundColor: exportFps === f ? '#ffffff' : 'transparent',
                                color: exportFps === f ? '#000000' : '#ffffff',
                                borderColor: '#ffffff',
                                borderStyle: 'solid',
                                borderWidth: '1px',
                                cursor: 'pointer',
                                fontWeight: exportFps === f ? 'bold' : 'normal',
                                borderRadius: '0'
                              }}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => exportResult('video')}
                        style={{
                          padding: '10px',
                          fontSize: '11px',
                          backgroundColor: '#ffffff',
                          color: '#000000',
                          borderColor: '#ffffff',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          letterSpacing: '1px'
                        }}
                      >
                        🎥 EXPORT VIDEO (MP4)
                      </button>
                      {videoElement && !webcamActive && (
                        <button
                          onClick={() => exportResult('mp3')}
                          style={{
                            padding: '10px',
                            fontSize: '11px',
                            backgroundColor: 'transparent',
                            color: '#ffffff',
                            borderColor: '#ffffff',
                            borderWidth: '1.5px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            letterSpacing: '1px'
                          }}
                        >
                          🎵 EXPORT AUDIO (MP3)
                        </button>
                      )}
                    </div>
                  )
                ) : null}

                {/* ASCII specific exports */}
                {['ascii-classic', 'ascii-dense', 'ascii-blocks', 'ascii-braille', 'ascii-halfblock', 'ascii-edge', 'ascii-shade', 'ascii-box', 'ascii-katakana', 'ascii-math', 'ascii-binary', 'ascii-morse', 'ascii-custom', 'typewriter'].includes(activeEffect) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button
                      onClick={() => exportResult('text')}
                      style={{
                        padding: '8px',
                        fontSize: '10.5px',
                        color: 'var(--accent-cyan)',
                        borderColor: 'var(--accent-cyan)'
                      }}
                    >
                      📝 COPY TEXT
                    </button>
                    <button onClick={() => exportResult('html')} style={{ padding: '8px', fontSize: '10.5px' }}>
                      🌐 HTML FILE
                    </button>
                    <button
                      onClick={() => exportResult('ansi')}
                      style={{
                        padding: '8px',
                        fontSize: '10.5px',
                        color: 'var(--accent-yellow)',
                        borderColor: 'var(--accent-yellow)'
                      }}
                    >
                      📟 ANSI COLOR
                    </button>
                    <button
                      onClick={() => exportResult('svg')}
                      style={{
                        padding: '8px',
                        fontSize: '10.5px',
                        color: 'var(--accent-purple)',
                        borderColor: 'var(--accent-purple)'
                      }}
                    >
                      🎨 SVG VECTOR
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {collapsed && (
        <div
          className="premium-expand-trigger premium-expand-trigger-right"
          onClick={() => setCollapsed(false)}
          title="Expand Right Panel"
        >
          <div className="trigger-glow-line" />
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="trigger-chevron">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </div>
      )}
    </>
  );
};
