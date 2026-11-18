import type { SimEvent, ToolCommand, ToolResult } from '@/shared/protocol';
import type { CommandQueue } from '../commands';
import type { CityState } from '../state';
import { planBulldoze } from './bulldoze';
import { planNetwork } from './network';
import { fail, type ToolPlan } from './plan';
import { planTerraform } from './terraform';

/** Plan a tool use, including the funds check. Never changes state. */
export function planTool(state: CityState, cmd: ToolCommand): ToolPlan {
  if (!state.inBounds(cmd.x0, cmd.y0)) return fail('Off the map');
  let plan: ToolPlan;
  switch (cmd.tool) {
    case 'road':
    case 'rail':
    case 'power':
      plan = planNetwork(state, cmd, cmd.tool);
      break;
    case 'bulldoze':
      plan = planBulldoze(state, cmd);
      break;
    case 'raise':
    case 'lower':
    case 'level':
      plan = planTerraform(state, cmd);
      break;
  }
  if (plan.ok && plan.cost > state.funds) return fail('Not enough funds', plan.tiles);
  return plan;
}

export function toResult(cmd: ToolCommand, plan: ToolPlan): ToolResult {
  const result: ToolResult = {
    type: 'toolResult',
    requestId: cmd.requestId,
    dryRun: cmd.dryRun,
    ok: plan.ok,
    cost: plan.cost,
    tiles: plan.tiles,
    bad: plan.bad,
  };
  if (plan.reason !== undefined) result.reason = plan.reason;
  return result;
}

/** Plan, charge and apply a tool command; report the outcome as an event. */
export function runTool(state: CityState, cmd: ToolCommand): ToolResult {
  const plan = planTool(state, cmd);
  if (plan.ok && !cmd.dryRun) {
    plan.apply();
    state.funds -= plan.cost;
  }
  return toResult(cmd, plan);
}

export function registerToolCommands(queue: CommandQueue, emit: (event: SimEvent) => void): void {
  queue.on('tool', (state, cmd) => {
    emit(runTool(state, cmd));
  });
}
