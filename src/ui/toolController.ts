import type { ToolCommand, ToolId, ToolResult } from '@/shared/protocol';
import type { PickResult } from '@/render/picking';
import type { Renderer } from '@/render/renderer';
import type { SimBridge } from '@/sim/bridge';
import { activeTool, brush, costTag, formatMoney, toast } from './store';

const TERRAFORM = new Set<ToolId>(['raise', 'lower', 'level']);
const REPEAT_MS = 250;

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
    });
    // Re-plan whenever the tool or brush changes.
    const reset = () => {
      this.dragStart = null;
      this.stopRepeat();
      this.refreshPreview();
    };
    activeTool.subscribe(reset);
    brush.subscribe(reset);
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
    return {
      type: 'tool',
      tool,
      x0: start.x,
      y0: start.y,
      x1: end.x,
      y1: end.y,
      brush: brush.value,
      tunnel: this.shift,
      dryRun,
      requestId: this.requestId,
    };
  }

  private refreshPreview(): void {
    const tool = activeTool.value;
    const cmd = tool ? this.command(tool, true) : null;
    if (!cmd) {
      this.latestDryRun = -1;
      this.renderer.preview.clear();
      costTag.value = null;
      return;
    }
    this.sim.command(cmd);
  }

  private apply(): void {
    const tool = activeTool.value;
    const cmd = tool ? this.command(tool, false) : null;
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
    const label = activeTool.value === 'bulldoze' ? 'Clear' : this.shift && result.ok ? 'Tunnel' : '';
    costTag.value = {
      x: this.mouse.x,
      y: this.mouse.y,
      text: result.ok ? `${label ? `${label} ` : ''}${formatMoney(result.cost)}` : (result.reason ?? "Can't build"),
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
