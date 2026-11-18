import { isPark, isPower, isRail, isRoad, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import type { CityMirror } from './mirror';
import type { Renderer } from './renderer';

type Rgb = [number, number, number];

const ZONE_RGB: Record<ZoneType, Rgb> = {
  [ZoneType.R]: [95, 200, 105],
  [ZoneType.C]: [77, 163, 255],
  [ZoneType.I]: [245, 197, 66],
};
const KIND_RGB: Partial<Record<number, Rgb>> = {
  [TileKind.Water]: [40, 110, 170],
  [TileKind.Tree]: [52, 104, 50],
  [TileKind.Rubble]: [130, 120, 105],
  [TileKind.CoalPlant]: [90, 90, 95],
  [TileKind.NuclearPlant]: [200, 200, 195],
  [TileKind.SolarFarm]: [40, 70, 130],
  [TileKind.WindTurbine]: [235, 235, 235],
  [TileKind.GasPlant]: [215, 215, 205],
  [TileKind.OilPlant]: [120, 105, 90],
  [TileKind.WaterTower]: [150, 195, 225],
  [TileKind.Landfill]: [125, 110, 85],
  [TileKind.CityHall]: [225, 220, 205],
  [TileKind.Hospital]: [240, 240, 240],
  [TileKind.University]: [165, 90, 65],
  [TileKind.Museum]: [225, 220, 205],
  [TileKind.Zoo]: [140, 190, 95],
  [TileKind.AmusementPark]: [215, 80, 80],
  [TileKind.Statue]: [200, 200, 190],
  [TileKind.ClockTower]: [165, 90, 65],
  [TileKind.TimSign]: [255, 245, 215],
  [TileKind.BusStop]: [46, 134, 222],
  [TileKind.SubwayStation]: [46, 134, 222],
  [TileKind.PoliceStation]: [60, 90, 200],
  [TileKind.FireStation]: [210, 60, 50],
  [TileKind.Stadium]: [230, 230, 225],
  [TileKind.Seaport]: [150, 150, 150],
  [TileKind.Airport]: [160, 165, 170],
};

/** Paints the minimap: terrain and buildings, the active overlay, and the camera's view. */
export class MinimapPainter {
  private canvas: HTMLCanvasElement | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly mirror: CityMirror,
    private readonly renderer: Renderer,
  ) {}

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    canvas.width = canvas.height = this.mirror.size;
    const move = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * this.mirror.size;
      const z = ((e.clientY - rect.top) / rect.height) * this.mirror.size;
      this.renderer.cityCamera.focus(x, z);
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      move(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) move(e);
    });
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.paint();
    }, 500);
    this.paint();
  }

  private tileColour(i: number): Rgb {
    const m = this.mirror;
    const kind = m.tiles[i] ?? 0;
    const zone = zoneOf(kind);
    if (zone) {
      const base = ZONE_RGB[zone.type];
      const k = 0.45 + (zone.density / 8) * 0.55;
      return [base[0] * k, base[1] * k, base[2] * k];
    }
    if (isRoad(kind)) return [70, 72, 78];
    if (isRail(kind)) return [125, 95, 72];
    if (isPower(kind)) return [170, 170, 170];
    if (isPark(kind)) return [120, 210, 110];
    const fixed = KIND_RGB[kind];
    if (fixed) return fixed;
    const x = i % m.size;
    const h = m.corner(x, (i - x) / m.size);
    return [100 + h * 4, 150 + h * 5, 75 + h * 3];
  }

  private paint(): void {
    const canvas = this.canvas;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const size = this.mirror.size;
    const image = g.createImageData(size, size);
    const overlay = this.renderer.overlay.pixels;
    const overlaySide = overlay ? Math.round(Math.sqrt(overlay.length / 4)) : 0;
    for (let i = 0; i < size * size; i++) {
      let [r, gr, b] = this.tileColour(i);
      if (overlay) {
        const x = i % size;
        const y = (i - x) / size;
        const o = (Math.floor((y * overlaySide) / size) * overlaySide + Math.floor((x * overlaySide) / size)) * 4;
        const a = (overlay[o + 3] ?? 0) / 255;
        r = r * (1 - a) + (overlay[o] ?? 0) * a;
        gr = gr * (1 - a) + (overlay[o + 1] ?? 0) * a;
        b = b * (1 - a) + (overlay[o + 2] ?? 0) * a;
      }
      image.data.set([r, gr, b, 255], i * 4);
    }
    g.putImageData(image, 0, 0);
    const view = this.renderer.viewFootprint();
    g.beginPath();
    view.forEach(([x, z], k) => {
      if (k === 0) g.moveTo(x, z);
      else g.lineTo(x, z);
    });
    g.closePath();
    g.lineWidth = size / 128;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.stroke();
  }
}
