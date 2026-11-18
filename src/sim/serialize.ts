import type { MapSize } from '@/shared/constants';
import type { DifficultyName } from '@/shared/difficulty';
import type { ActiveDisaster, Bond, Census, Evaluation, Funding, GameDate, HistorySample, Ledger, Valves } from '@/shared/protocol';
import { migrate, type RawSave } from './migrate';
import type { RngState } from './rng';
import { FORMAT_VERSION, savedArrays, savedHeader } from './serializeRegistry';
import { CityState, emptyCensus } from './state';

const MAGIC = 'TIMC';

/**
 * Binary save: "TIMC", u16 version, u32 header length, the JSON header,
 * then each saved array as u32 byte length + raw little-endian bytes.
 */
export function serialize(state: CityState): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify(savedHeader(state)));
  const arrays = savedArrays(state).map(([, a]) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  const total = 4 + 2 + 4 + header.length + arrays.reduce((n, a) => n + 4 + a.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode(MAGIC), 0);
  view.setUint16(4, FORMAT_VERSION, true);
  view.setUint32(6, header.length, true);
  out.set(header, 10);
  let at = 10 + header.length;
  for (const a of arrays) {
    view.setUint32(at, a.length, true);
    out.set(a, at + 4);
    at += 4 + a.length;
  }
  return out;
}

/** Split a save into its version, header and arrays without building a city. */
export function readRaw(bytes: Uint8Array): RawSave {
  if (bytes.length < 10 || new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) {
    throw new Error('This is not a Tim City save file');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  if (version > FORMAT_VERSION) {
    throw new Error(`This save comes from a newer version of Tim City (format ${String(version)})`);
  }
  const headerLength = view.getUint32(6, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(10, 10 + headerLength))) as Record<string, unknown>;
  const arrays = new Map<string, Uint8Array>();
  // Array names come from the registry of the save's own version; their
  // order is fixed, so rebuild the name list for that version.
  const probe = new CityState({ name: '', seed: '', size: header.size as MapSize });
  const names = savedArrays(probe).map(([name]) => name);
  let at = 10 + headerLength;
  for (const name of names) {
    if (at >= bytes.length) break;
    const length = view.getUint32(at, true);
    arrays.set(name, bytes.slice(at + 4, at + 4 + length));
    at += 4 + length;
  }
  return { version, header, arrays };
}

/** The map size and city name in a save, read from its header alone. */
export function peekSave(bytes: Uint8Array): { name: string; seed: string; size: MapSize } {
  const raw = readRaw(bytes);
  return { name: String(raw.header.name), seed: String(raw.header.seed), size: raw.header.size as MapSize };
}

export function deserialize(bytes: Uint8Array): CityState {
  const save = migrate(readRaw(bytes), FORMAT_VERSION);
  const h = save.header;
  const state = new CityState({ name: String(h.name), seed: String(h.seed), size: h.size as MapSize });
  for (const [name, target] of savedArrays(state)) {
    const data = save.arrays.get(name);
    if (!data) continue;
    const bytesView = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
    if (data.length !== bytesView.length) throw new Error(`Save array ${name} has the wrong size`);
    bytesView.set(data);
  }
  Object.assign(state.date, h.date as GameDate);
  state.funds = h.funds as number;
  state.taxRate = h.taxRate as number;
  state.difficulty = h.difficulty as DifficultyName;
  state.randomDisasters = h.randomDisasters as boolean;
  Object.assign(state.funding, h.funding as Funding);
  state.bonds = h.bonds as Bond[];
  state.constructionThisYear = h.constructionThisYear as number;
  state.lastYear = h.lastYear as Ledger | null;
  state.bankrupt = h.bankrupt as boolean;
  state.brownout = h.brownout as boolean;
  Object.assign(state.capNotified, h.capNotified as CityState['capNotified']);
  // Saves from before a census field existed get it zeroed until the next count.
  const census = h.census as Census;
  state.census = { ...emptyCensus(), ...census, plants: { ...emptyCensus().plants, ...census.plants } };
  Object.assign(state.valves, h.valves as Valves);
  state.evaluation = h.evaluation as Evaluation | null;
  state.classReached = h.classReached as number;
  state.overcast = (h.overcast as boolean | undefined) ?? false;
  state.utilityGraceUntil = h.utilityGraceUntil as number;
  state.lastYearApproval = h.lastYearApproval as number | null;
  state.lastYearScore = h.lastYearScore as number;
  state.lastYearPop = h.lastYearPop as number;
  state.burnedThisYear = h.burnedThisYear as number;
  const history = h.history as { monthly: HistorySample[]; yearly: HistorySample[] };
  state.history.monthly.push(...history.monthly);
  state.history.yearly.push(...history.yearly);
  state.restoreRandom(h.random as [string, RngState][]);
  state.disasters = h.disasters as ActiveDisaster[];
  state.nextDisasterId = h.nextDisasterId as number;
  state.radiation = new Map(h.radiation as [number, number][]);
  state.pollutionSpills = h.pollutionSpills as CityState['pollutionSpills'];
  state.markAllDirty();
  return state;
}
