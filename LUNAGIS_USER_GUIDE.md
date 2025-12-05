# Lunagis User Guide

## Introduction

**Lunagis** is a high-performance, browser-based temporal data visualization platform designed for analyzing large-scale geospatial and time-series datasets. Originally developed for lunar surface illumination analysis, Lunagis provides powerful tools for exploring any temporal-spatial data.

### What Lunagis Can Do

- **Visualize temporal datasets** with thousands of time steps and millions of pixels
- **Analyze illumination patterns** including daylight fraction and nightfall forecasting
- **Create and manage annotations** (circles, rectangles, paths with waypoints)
- **Plan traverses** with activity scheduling and YAML export for mission planning
- **Compare multiple data layers** with configurable transparency and color maps
- **Track temporal events** with timeline markers and navigation

### Key Innovations

| Feature               | Description                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **Lazy Loading**      | Zarr and NetCDF files load on-demand, keeping memory usage low even for multi-GB datasets |
| **Smart Caching**     | LRU cache with 1GB capacity ensures smooth playback while managing memory                 |
| **WebGL Rendering**   | GPU-accelerated rendering for real-time colormap application and layer compositing        |
| **Streaming Parsers** | Time slices are extracted without loading entire files into memory                        |
| **Binary Packing**    | Boolean illumination data is bit-packed for 8× memory reduction                           |

### Performance Characteristics

- **Large Dataset Support**: Handle files with 8760+ time steps (full year hourly) at 1000×1000 resolution
- **Instant Navigation**: Cached slices display immediately; uncached slices load in <100ms from Zarr
- **Smooth Playback**: Achieve 30 FPS animation with pre-cached data
- **Memory Efficient**: Typical session uses 200-500MB regardless of source file size
- **Browser-Native**: No server required — runs entirely in your web browser

### Supported Data Formats

| Format               | Best For                      | Performance                   |
| -------------------- | ----------------------------- | ----------------------------- |
| **Zarr (.zarr.zip)** | Large temporal datasets       | ⭐⭐⭐ Fastest random access     |
| **NetCDF4 (.nc)**    | Scientific data with metadata | ⭐⭐ Good for sequential access |
| **NumPy (.npy)**     | Small to medium datasets      | ⭐⭐ Loads entirely into memory |
| **VRT + PNG**        | Georeferenced base maps       | ⭐⭐⭐ Instant display           |

---

## Quick Start

1. **Load Data**: Click "Layers" → Add a data layer (.npy, .nc, or .zarr.zip)
2. **Navigate Time**: Use the time slider or arrow keys (← →)
3. **Play/Pause**: Press `Space` to animate through time
4. **Zoom/Pan**: Mouse wheel to zoom, drag to pan

---

## Main Tools

| Tool          | Shortcut | Description                                           |
| ------------- | -------- | ----------------------------------------------------- |
| **Layers**    | `1`      | Manage data layers, base maps, and image overlays     |
| **Artifacts** | -        | Create circles, rectangles, and paths for annotations |
| **Events**    | -        | Mark temporal events on the timeline                  |
| **Measure**   | `4`      | Select cells to view time series data                 |
| **Config**    | `5`      | Adjust playback speed and display settings            |

---

## Loading Data

### Supported Formats

| Format                  | Extension       | Description                                          |
| ----------------------- | --------------- | ---------------------------------------------------- |
| **Illumination NetCDF** | `.nc`           | NetCDF4 with temporal illumination data              |
| **Zarr Archive**        | `.zarr.zip`     | Compressed Zarr arrays (recommended for large files) |
| **NumPy Binary**        | `.npy`          | 3D arrays [height, width, time]                      |
| **Base Map**            | `.vrt` + `.png` | Georeferenced images                                 |
| **Image Overlay**       | `.png`, `.jpg`  | Standalone image overlays                            |

### Adding Layers

1. Click **Layers** in the toolbar
2. Click **Add Layer** dropdown
3. Select the appropriate file type
4. Choose your file(s) from the file browser

---

## Layer Configuration

### Color Maps
Available presets: `Viridis`, `Plasma`, `Inferno`, `Magma`, `Cividis`, `Turbo`, `Grayscale`, `Custom`, `DivergingThreshold`

### Layer Controls
- **Visibility**: Toggle eye icon
- **Opacity**: Adjust slider (0-100%)
- **Value Range**: Set min/max for color scaling
- **Transparency Thresholds**: Hide values outside a range
- **Invert**: Flip the color scale

---

## Analysis Features

### Daylight Fraction
Calculates percentage of daylight time per pixel over the selected time range.

**Formula**: `(dayHours / totalHours) × 100`

**Hover Details**:
- Total day/night hours
- Longest/shortest day and night periods
- Number of day/night cycles

### Nightfall Forecast
Predicts duration of upcoming night periods.

**Output Values**:
- **Positive**: Hours until next nightfall (daytime)
- **Negative**: Hours into current night (nighttime)
- **Zero**: No more night periods ahead

---

## Artifacts

### Types
| Type          | Description                           |
| ------------- | ------------------------------------- |
| **Circle**    | Point annotations with radius         |
| **Rectangle** | Area selection (fixed or free-form)   |
| **Path**      | Multi-waypoint routes with activities |

### Path Features
- Add waypoints by clicking on the map
- Assign activities to waypoints (Drive, Comms, Science, etc.)
- Set activity durations
- Export paths to YAML format
- Import paths from YAML files

---

## Events

Mark important temporal milestones:
1. Click **Events** in the toolbar
2. Click **Add Event**
3. Set name, description, and color
4. Navigate to the desired time
5. Click to place the event

Events appear as markers on the time series plot and can be clicked to navigate to that time.

---

## Time Navigation

| Action            | Method                                   |
| ----------------- | ---------------------------------------- |
| **Play/Pause**    | `Space` or play button                   |
| **Step Forward**  | `→` arrow key                            |
| **Step Backward** | `←` arrow key                            |
| **Jump to Time**  | Click on time slider                     |
| **Zoom Timeline** | Drag to select range in time series plot |
| **Reset Zoom**    | Double-click time series plot            |

### Playback Speed
Adjust in Config panel: **1-30 FPS**

---

## Session Management

### Export Session
- Saves all layers, artifacts, events, and settings to `.json`
- Data files are referenced by name (not embedded)
- Click **Export** in toolbar

### Import Session
- Click **Import** in toolbar
- Select session `.json` file
- Provide required data files when prompted

### Import Path YAML
- Click **Import** in toolbar
- Select `.yaml` or `.yml` path file
- Path artifact is created automatically

---

## Keyboard Shortcuts

| Key       | Action                  |
| --------- | ----------------------- |
| `1`       | Layers panel            |
| `2`       | Pan tool                |
| `3`       | Zoom tool               |
| `4`       | Cell select             |
| `5`       | Multi-cell select       |
| `Space`   | Play/Pause              |
| `←` / `→` | Previous/Next time step |
| `Ctrl+Z`  | Undo                    |
| `Ctrl+Y`  | Redo                    |

---

## Tips

- **Large Files**: Use Zarr format for better performance with large datasets
- **Layer Order**: Layers render bottom-to-top; adjust opacity to see multiple layers
- **Cell Selection**: Selected cells appear in the time series plot
- **Save Often**: Export your session regularly to preserve work
- **Memory**: Close unused layers when working with multiple large datasets

---

## File Structure for Base Maps

Base maps require two files:
1. **VRT File** (`.vrt`): Contains georeferencing metadata
2. **PNG File** (`.png`): The actual image data

Both files must be in the same directory with matching names.

---

## Troubleshooting

| Issue              | Solution                                   |
| ------------------ | ------------------------------------------ |
| Layer not loading  | Check file format and dimensions           |
| Slow performance   | Use Zarr format; reduce time range         |
| Colors look wrong  | Adjust value range; try different colormap |
| Session won't load | Ensure all referenced files are available  |

---

*Lunagis v1.0.0 | Built with React, TypeScript, and Vite*
