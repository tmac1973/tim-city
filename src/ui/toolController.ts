import type { ToolCommand, ToolId, ToolResult } from '@/shared/protocol';
import { guideLots, LOT_GAPS, snapParallel } from '@/render/lotGuide';
import { LANDMARK_REACH, UTILITY } from '@/shared/costs';
import { COVERAGE_RADIUS } from '@/sim/systems/coverage';
import { SERVED } from '@/sim/systems/utilityRules';
import { isRoad } from '@/shared/tiles';
import type { PickResult } from '@/render/picking';
import type { Renderer } from '@/render/renderer';
import type { SimBridge } from '@/sim/bridge';
import { TIER_NAMES } from '@/shared/tiles';
import { activeTool, blockFill, brush, undergroundView, costTag, formatMoney, queryResult, toast, type UiTool, zoneTier } from './store';

const TERRAFORM = new Set<UiTool>(['raise', 'lower', 'level']);
const ZONES = new Set<UiTool>(['residential', 'commercial', 'industrial']);
const REPEAT_MS = 250;

/** Share of a coverage radius where one building at full strength serves (cover ≥ SERVED). */
const SERVED_SHARE = 1 - SERVED / 255;
/**
 * Tools whose building reaches around it: the radius in tiles, and the share
 * of it the disc fills (where coverage counts as served). Land-value
 * landmarks fill the whole circle, since their boost just fades out.
 */
const REACH: Partial<Record<UiTool, { radius: number; served: number }>> = {
  police: { radius: COVERAGE_RADIUS, served: SERVED_SHARE },
  fire: { radius: COVERAGE_RADIUS, served: SERVED_SHARE },
  waterTower: { radius: UTILITY.waterTower.radius, served: SERVED_SHARE },
  landfill: { radius: UTILITY.landfill.radius, served: SERVED_SHARE },
  ...Object.fromEntries(
    Object.entries(LANDMARK_REACH).map(([name, reach]) => [name, { radius: reach.radius, served: name === 'hospital' || name === 'university' ? SERVED_SHARE : 1 }]),
  ),
};

/** The gap beside a parallel road, in words for the cost tag. */
function gapWords(gap: number): string {
  if (gap === LOT_GAPS[0]) return 'gap 3: one row of lots';
  if (gap === LOT_GAPS[1]) return 'gap 6: two rows of lots';
  return `gap ${String(gap)}`;
}

/**
 * Turns mouse input on the map into tool commands. While the mouse moves it
 * asks the sim for dry runs to drive the ghost preview and the cost tag; on
 * release (or each repeat for terraform) it sends the real command.
 */
export class ToolController {
  private dragStart: { x: number; y: number } | null = null;
  private requestId = 0;
  private latestDryRun = 0;
  private shift = false;
  /** Alt held: road drags don't snap to lot-fitting gaps. */
  private alt = false;
  /** Gap to the parallel road beside the current road drag, for the cost tag. */
  private gap: number | null = null;
  private mouse = { x: 0, y: 0 };
  private repeat: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Renderer,
    private readonly sim: SimBridge,
  ) {
    renderer.onHoverChange(() => {
      this.refreshPreview();
    });
    sim.onEvent((event) => {
      if (event.type === 'toolResult') this.onResult(event);
      else if (event.type === 'queryResult') queryResult.value = event;
    });
    // Re-plan whenever the tool or brush changes.
    const reset = () => {
      this.dragStart = null;
      this.stopRepeat();
      this.refreshPreview();
    };
    activeTool.subscribe(reset);
    brush.subscribe(reset);
    zoneTier.subscribe(reset);
    blockFill.subscribe(reset);
    undergroundView.subscribe(reset);
    this.listen();
  }

  private get hovered(): PickResult | null {
    return this.renderer.hovered;
  }

  private command(tool: ToolId, dryRun: boolean): ToolCommand | null {
    const end = this.hovered;
    if (!end) return null;
    const start = this.dragStart ?? end;
    this.requestId++;
    if (dryRun) this.latestDryRun = this.requestId;
    let [x0, y0, x1, y1] = [start.x, start.y, end.x, end.y];
    this.gap = null;
    if (tool === 'road' && this.dragStart && !this.shift) {
      // Nudge a straight road one tile so the land beside a parallel road fits whole lots.
      const snap = snapParallel(this.renderer.mirror, x0, y0, x1, y1, isRoad);
      if (snap) {
        this.gap = snap.gap;
        if (!this.alt && y0 === y1) [y0, y1] = [y0 + snap.shift, y1 + snap.shift];
        else if (!this.alt) [x0, x1] = [x0 + snap.shift, x1 + snap.shift];
        if (this.alt) this.gap = null;
      }
    }
    return {
      type: 'tool',
      tool,
      x0,
      y0,
      x1,
      y1,
      brush: brush.value,
      tunnel: this.shift,
      ...(ZONES.has(tool) || tool === 'block' ? { tier: zoneTier.value } : {}),
      ...(tool === 'block' && blockFill.value !== null ? { fill: blockFill.value } : {}),
      ...(tool === 'bulldoze' && undergroundView.value ? { underground: true } : {}),
      dryRun,
      requestId: this.requestId,
    };
  }

  private refreshPreview(): void {
    const tool = activeTool.value;
    const cmd = tool && tool !== 'query' ? this.command(tool, true) : null;
    if (!cmd) {
      this.latestDryRun = -1;
      this.renderer.preview.clear();
      this.renderer.lotGuide.clear();
      this.renderer.radiusGuide.clear();
      costTag.value = null;
      return;
    }
    this.sim.command(cmd);
  }

  private apply(): void {
    const tool = activeTool.value;
    const cmd = tool && tool !== 'query' ? this.command(tool, false) : null;
    if (cmd) this.sim.command(cmd);
  }

  private onResult(result: ToolResult): void {
    if (!result.dryRun) {
      if (!result.ok && result.reason) toast(result.reason);
      // The map changed; refresh what the preview shows.
      this.refreshPreview();
      return;
    }
    if (result.requestId !== this.latestDryRun || !activeTool.value) return;
    this.renderer.preview.show(result.tiles, result.bad, result.ok);
    // Show where a station, utility or landmark would reach.
    const reach = result.ok ? REACH[activeTool.value] : undefined;
    if (reach && result.tiles.length > 0) {
      const size = this.renderer.mirror.size;
      const xs = result.tiles.map((i) => i % size);
      const ys = result.tiles.map((i) => Math.floor(i / size));
      const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
      this.renderer.radiusGuide.show(cx, cy, reach.radius, reach.served);
    } else this.renderer.radiusGuide.clear();
    // Show the zone lots that would fit beside a road as it is drawn.
    if (result.ok && (activeTool.value === 'road' || (activeTool.value === 'block' && blockFill.value === null))) this.renderer.lotGuide.show(guideLots(this.renderer.mirror, result.tiles));
    else this.renderer.lotGuide.clear();
    const label = result.label ?? (activeTool.value === 'bulldoze' ? 'Clear' : this.shift && result.ok ? 'Tunnel' : '');
    costTag.value = {
      x: this.mouse.x,
      y: this.mouse.y,
      text: result.ok
        ? `${label ? `${label} ` : ''}${formatMoney(result.cost)}${ZONES.has(activeTool.value) && !result.label ? ` · ${TIER_NAMES[zoneTier.value] ?? ''}` : ''}${this.gap !== null ? ` · ${gapWords(this.gap)}` : ''}`
        : (result.reason ?? "Can't build"),
      ok: result.ok,
    };
  }

  private stopRepeat(): void {
    clearInterval(this.repeat);
    this.repeat = undefined;
  }

  private listen(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      const tool = activeTool.value;
      if (e.button !== 0 || !tool || !this.hovered) return;
      if (tool === 'query') {
        // A vehicle under the pointer: ride along instead of querying the tile.
        const vehicle = this.renderer.vehicleAtPointer();
        if (vehicle) {
          this.renderer.follow(vehicle);
          return;
        }
        this.sim.command({ type: 'query', x: this.hovered.x, y: this.hovered.y, requestId: ++this.requestId });
        return;
      }
      if (TERRAFORM.has(tool)) {
        this.apply();
        this.repeat = setInterval(() => {
          this.apply();
        }, REPEAT_MS);
      } else {
        this.dragStart = { x: this.hovered.x, y: this.hovered.y };
        this.refreshPreview();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      this.stopRepeat();
      if (this.dragStart) {
        this.apply();
        this.dragStart = null;
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      const tag = costTag.value;
      if (tag) costTag.value = { ...tag, x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('pointerleave', () => {
      costTag.value = null;
    });
    const onShift = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && e.altKey !== this.alt) {
        this.alt = e.altKey;
        this.refreshPreview();
      }
      if (e.key !== 'Shift' || e.shiftKey === this.shift) return;
      this.shift = e.shiftKey;
      this.refreshPreview();
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.dragStart) {
        this.dragStart = null;
        this.refreshPreview();
      }
      onShift(e);
    });
    window.addEventListener('keyup', onShift);
  }
}

