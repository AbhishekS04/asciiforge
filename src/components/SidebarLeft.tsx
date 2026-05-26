import React, { useState } from 'react';
import { EffectId, EffectGroup, EffectDefinition, Preset, Settings } from '../types';

interface SidebarLeftProps {
  activeEffect: EffectId;
  setActiveEffect: (id: EffectId) => void;
  settings: Settings;
  applyPreset: (preset: Preset) => void;
  customPresets: Preset[];
  saveCustomPreset: (name: string) => void;
  deleteCustomPreset: (id: string) => void;
  exportCustomPresets: () => void;
  importCustomPresets: (file: File) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const EFFECTS: EffectDefinition[] = [
  // Group 1: ASCII & Text
  { id: 'ascii-classic',   name: 'Classic ASCII',    group: 'ascii',    description: 'BT.601 luminance-mapped standard character ramp' },
  { id: 'ascii-dense',     name: 'Dense ASCII',      group: 'ascii',    description: 'High-density ramp — 18-char tonal spectrum' },
  { id: 'ascii-shade',     name: 'Shade ASCII',      group: 'ascii',    description: 'BT.709 + density LUT — perceptually accurate tones' },
  { id: 'ascii-halfblock', name: 'Half-Block Art',   group: 'ascii',    description: '▀▄█ block elements — 2× vertical pixel resolution' },
  { id: 'ascii-edge',      name: 'Edge ASCII',       group: 'ascii',    description: 'Sobel-aware char selection: ─ │ / \\ + for edges' },
  { id: 'ascii-box',       name: 'Box Drawing',      group: 'ascii',    description: 'IBM CP437 box-drawing contour symbols — connected grids' },
  { id: 'ascii-blocks',    name: 'Block Art',        group: 'ascii',    description: '░▒▓█ shaded block elements — clean retro grids' },
  { id: 'ascii-braille',   name: 'Braille Grid',     group: 'ascii',    description: '8-dot sub-pixel sampling — highest density ASCII' },
  { id: 'ascii-katakana',  name: 'Katakana',         group: 'ascii',    description: 'Half-width katakana as a luminance-mapped charset' },
  { id: 'ascii-math',      name: 'Math Symbols',     group: 'ascii',    description: '∞∑∆πΩ√∫ — mathematical charset density map' },
  { id: 'ascii-binary',    name: 'Binary Field',     group: 'ascii',    description: '0/1 threshold field — digital bit-pattern render' },
  { id: 'ascii-morse',     name: 'Morse Code',       group: 'ascii',    description: '· − space tri-state luminance pattern per column' },
  { id: 'ascii-emoji',     name: 'Emoji Map',        group: 'ascii',    description: 'Moon-phase emojis as a 5-step tonal spectrum' },
  { id: 'ascii-custom',    name: 'Custom Glyphs',    group: 'ascii',    description: 'User-defined charset with luminance index mapping' },
  { id: 'ascii-color',     name: 'Color ASCII',      group: 'ascii',    description: 'Full per-pixel RGB color character blocks' },
  { id: 'typewriter',      name: 'Typewriter',       group: 'ascii',    description: 'Dynamic monospace typing character layout' },

  // Group 2: Pixel & Halftone
  { id: 'halftone-dots',     name: 'Halftone Dots',    group: 'pixel', description: 'Luminance-scaled circular dot matrix (GPU)' },
  { id: 'halftone-lines',    name: 'Halftone Lines',   group: 'pixel', description: 'Rotated line screen halftone simulation (GPU)' },
  { id: 'crosshatch',        name: 'Crosshatch',       group: 'pixel', description: 'Multi-directional sketched line shader (GPU)' },
  { id: 'dither-bayer',      name: 'Bayer Dither',     group: 'pixel', description: 'Ordered 4×4 matrix threshold dithering' },
  { id: 'dither-floyd',      name: 'Floyd-Steinberg',  group: 'pixel', description: 'Error diffusion — smooth gradient preservation' },
  { id: 'dither-atkinson',   name: 'Atkinson Dither',  group: 'pixel', description: 'Apple Macintosh hyper-contrast dither style' },
  { id: 'dither-blue-noise', name: 'Blue Noise Dither',group: 'pixel', description: 'Perceptually uniform stochastic noise dithering' },
  { id: 'pixel-sort',        name: 'Pixel Sort',       group: 'pixel', description: 'Glitch: rows sorted by brightness threshold' },
  { id: 'blockify',          name: 'Retro Blockify',   group: 'pixel', description: 'Integer downscaled pixel mosaic grid' },
  { id: 'threshold',         name: 'Threshold',        group: 'pixel', description: 'Pure binary high-contrast black & white' },

  // Group 3: Artistic
  { id: 'contour-edges', name: 'Sobel Edges',    group: 'artistic', description: 'Convolution kernel gradient edge detection (GPU)' },
  { id: 'wave-lines',    name: 'Wave Lines',     group: 'artistic', description: 'Wavy horizontal line density contour map' },
  { id: 'voronoi',       name: 'Voronoi Field',  group: 'artistic', description: 'Centroid-seed cellular color segmentation' },
  { id: 'dots-field',    name: 'Dots Field',     group: 'artistic', description: 'Stippled particle field array rendering' },
  { id: 'noise-field',   name: 'Noise Flow',     group: 'artistic', description: 'Perlin vector field procedural flow painting' },
  { id: 'vhs-glitch',    name: 'VHS Glitch',     group: 'artistic', description: 'Analog tape color shift & signal jitter (GPU)' },
  { id: 'oil-paint',     name: 'Oil Paint',      group: 'artistic', description: 'Most-frequent color bin local integration filter' },
  { id: 'kuwahara',      name: 'Kuwahara',       group: 'artistic', description: 'Painterly edge-preserving quadrant blur (GPU)' },
  { id: 'stained-glass', name: 'Stained Glass',  group: 'artistic', description: 'Segmented mosaic borders with glass tinting' },
];


export const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'monochrome-ink',
    name: 'MONOCHROME INK',
    effectId: 'ascii-classic',
    settings: {
      colorMode: 'mono',
      monoFg: '#ffffff',
      monoBg: '#09090b',
      scanlines: 0,
      blockSize: 8
    }
  },
  {
    id: 'macintosh-84',
    name: 'MACINTOSH 84',
    effectId: 'dither-atkinson',
    settings: {
      colorMode: 'mono',
      monoFg: '#ffffff',
      monoBg: '#000000',
      brightness: 10,
      contrast: 20
    }
  },
  {
    id: 'retro-newsprint',
    name: 'RETRO NEWSPRINT',
    effectId: 'halftone-dots',
    settings: {
      colorMode: 'mono',
      monoFg: '#18181b',
      monoBg: '#f4f4f5',
      blockSize: 8,
      contrast: 30
    }
  },
  {
    id: 'analog-vhs',
    name: 'ANALOG TAPE',
    effectId: 'vhs-glitch',
    settings: {
      vhsJitter: 2.0,
      chromaticAberration: 8,
      scanlines: 40,
      filmGrain: 30
    }
  },
  {
    id: 'terminal-classic',
    name: 'TERMINAL GREEN',
    effectId: 'ascii-shade',
    settings: {
      colorMode: 'mono',
      monoFg: '#00ff41',
      monoBg: '#09090b',
      thresholdValue: 80
    }
  }
];

export const SidebarLeft: React.FC<SidebarLeftProps> = ({
  activeEffect,
  setActiveEffect,
  settings: _settings,
  applyPreset,
  customPresets,
  saveCustomPreset,
  deleteCustomPreset,
  exportCustomPresets,
  importCustomPresets,
  collapsed,
  setCollapsed
}) => {
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    saveCustomPreset(newPresetName.trim());
    setNewPresetName('');
    setShowSavePreset(false);
  };

  const handleImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      importCustomPresets(e.target.files[0]);
    }
  };

  const renderGroup = (group: EffectGroup, title: string) => {
    const groupEffects = EFFECTS.filter((eff) => eff.group === group);

    return (
      <div className="effects-group" key={group}>
        <div className="category-title">{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          {groupEffects.map((eff) => (
            <button
              key={eff.id}
              className={`effect-item ${activeEffect === eff.id ? 'selected' : ''}`}
              onClick={() => setActiveEffect(eff.id)}
              style={{ padding: '8px 10px', height: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
            >
              <span className="effect-name">{eff.name}</span>
              <span className="effect-desc" style={{ textAlign: 'left' }}>{eff.description}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={`panel panel-left ${collapsed ? 'collapsed-left' : ''}`}>
        <div className="panel-header">
          <span>⚙️ Effect Presets</span>
          <button
            onClick={() => setCollapsed(true)}
            className="panel-collapse-toggle-btn"
            title="Collapse Sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chevron-icon">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        </div>

        <div className="panel-content">
          {/* Preset Manager Section */}
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <div className="category-title" style={{ borderLeftColor: 'var(--accent-color)' }}>SYSTEM PRESETS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', marginBottom: '12px' }}>
              {DEFAULT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  style={{ justifyContent: 'flex-start', fontSize: '11px', textTransform: 'uppercase' }}
                >
                  📟 {preset.name}
                </button>
              ))}
            </div>

            <div className="category-title" style={{ borderLeftColor: 'var(--accent-cyan)' }}>CUSTOM PRESETS</div>
            {customPresets.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic', marginBottom: '8px' }}>
                No custom presets saved.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px', maxHeight: '120px', overflowY: 'auto' }}>
                {customPresets.map((preset) => (
                  <div key={preset.id} style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => applyPreset(preset)}
                      style={{ flex: 1, justifyContent: 'flex-start', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      💾 {preset.name}
                    </button>
                    <button
                      onClick={() => deleteCustomPreset(preset.id)}
                      style={{ borderColor: '#ff4444', color: '#ff4444', minWidth: '30px' }}
                      title="Delete Preset"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {!showSavePreset ? (
                <button onClick={() => setShowSavePreset(true)} className="primary" style={{ fontSize: '11px' }}>
                  + SAVE CURRENT AS PRESET
                </button>
              ) : (
                <form onSubmit={handleSavePreset} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="PRESET NAME..."
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    autoFocus
                    maxLength={20}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button type="submit" className="primary" style={{ flex: 1, padding: '4px 8px' }}>SAVE</button>
                    <button type="button" onClick={() => setShowSavePreset(false)} style={{ flex: 1, padding: '4px 8px' }}>CANCEL</button>
                  </div>
                </form>
              )}

              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <button onClick={exportCustomPresets} style={{ flex: 1, padding: '4px 6px', fontSize: '10px' }} title="Export Presets to JSON">
                  📤 EXPORT
                </button>
                <label className="btn" style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  padding: '4px 6px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }} title="Import Presets from JSON">
                  📥 IMPORT
                  <input type="file" accept=".json" onChange={handleImportChange} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>

          {/* Effects Categorized Lists */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {renderGroup('ascii', '1. ASCII & TEXT GLYPHS')}
            {renderGroup('pixel', '2. PIXEL & HALFTONE SCREEN')}
            {renderGroup('artistic', '3. ARTISTIC SHADERS & GLITCH')}
          </div>
        </div>
      </div>

      {collapsed && (
        <div
          className="premium-expand-trigger premium-expand-trigger-left"
          onClick={() => setCollapsed(false)}
          title="Expand Left Panel"
        >
          <div className="trigger-glow-line" />
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="trigger-chevron">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      )}
    </>
  );
};
