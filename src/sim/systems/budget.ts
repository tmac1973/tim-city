import { MONTHS_PER_YEAR, TICKS_PER_MONTH } from '@/shared/constants';
import { UPKEEP } from '@/shared/costs';
import type { Ledger, SimEvent } from '@/shared/protocol';
import { isRail, isRoad, TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { landmarkUpkeep } from './landmarks';
import { EDUCATED } from './pollution';
import { JOBS_PER_LEVEL, RESIDENTS_PER_LEVEL } from './zones';

/** Tax per resident or job, per point of land value, per percent of tax. */
export const TAX_FACTOR = 0.002;
export const ROAD_UPKEEP = 1;
export const RAIL_UPKEEP = 2;
export const STATION_UPKEEP = 100;

export const BOND_PRINCIPAL = 10_000;
export const BOND_TERM = 10;
export const MAX_BONDS = 5;

/** Interest on the next bond: 5% plus 1% for each one already outstanding. */
export const nextBondRate = (state: CityState): number => (5 + state.bonds.length) / 100;

/** This year's instalment on a bond: an equal share of principal plus interest. */
export const bondPayment = (b: { principal: number; rate: number; yearsLeft: number }): number =>
  Math.round(b.principal / b.yearsLeft + b.principal * b.rate);

/**
 * A year's taxes and running costs at today's city and settings:
 * each zone pays people × land value × tax rate × 0.002; roads cost $1 and
 * rail $2 a tile and stations $100 each, scaled by their funding; bonds
 * cost this year's instalments.
 */
export function computeLedger(state: CityState): Ledger {
  const ledger: Ledger = {
    residentialTax: 0,
    commercialTax: 0,
    industrialTax: 0,
    roads: 0,
    police: 0,
    fire: 0,
    bonds: 0,
    transit: 0,
    utilities: 0,
    landmarks: 0,
    tourism: 0,
    construction: 0,
  };
  const landValue = state.field('landValue');
  const { size, tiles, flags, parts } = state;
  let roadTiles = 0;
  let railTiles = 0;
  let police = 0;
  let fire = 0;
  let utilities = 0;
  let stops = 0;
  let track = 0;
  let stations = 0;
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    if (isRoad(kind)) roadTiles++;
    if (isRail(kind)) railTiles++;
    if (parts[i] === 1 && kind === TileKind.PoliceStation) police++;
    if (parts[i] === 1 && kind === TileKind.FireStation) fire++;
    if (kind === TileKind.BusStop) stops++;
    if (kind === TileKind.SubwayStation) stations++;
    if (state.subway[i] === 1) track++;
    if (parts[i] === 1 && kind === TileKind.WaterTower) utilities += UPKEEP.waterTower;
    if (parts[i] === 1 && kind === TileKind.Landfill) utilities += UPKEEP.landfill;
    if (!((flags[i] ?? 0) & TileFlag.ZONE_CENTER)) continue;
    const zone = zoneOf(kind);
    if (!zone) continue;
    const lv = landValue[state.blockIndex(i % size, Math.floor(i / size))] ?? 0;
    const people = zone.density * (zone.type === ZoneType.R ? RESIDENTS_PER_LEVEL : JOBS_PER_LEVEL);
    const tax = people * lv * state.taxRate * TAX_FACTOR;
    if (zone.type === ZoneType.R) ledger.residentialTax += tax;
    else if (zone.type === ZoneType.C) ledger.commercialTax += tax;
    // Industry near a university earns a quarter more.
    else ledger.industrialTax += tax * ((state.field('educationCover')[state.blockIndex(i % size, Math.floor(i / size))] ?? 0) >= EDUCATED ? 1.25 : 1);
  }
  ledger.residentialTax = Math.round(ledger.residentialTax);
  ledger.commercialTax = Math.round(ledger.commercialTax);
  ledger.industrialTax = Math.round(ledger.industrialTax);
  ledger.roads = Math.round(((roadTiles * ROAD_UPKEEP + railTiles * RAIL_UPKEEP) * state.funding.road) / 100);
  ledger.police = Math.round((police * STATION_UPKEEP * state.funding.police) / 100);
  ledger.fire = Math.round((fire * STATION_UPKEEP * state.funding.fire) / 100);
  ledger.utilities = Math.round((utilities * state.funding.utilities) / 100);
  const transit = stops * UPKEEP.busStop + track * UPKEEP.subway + stations * UPKEEP.subwayStation;
  ledger.transit = Math.round((transit * state.funding.transit) / 100);
  ledger.landmarks = landmarkUpkeep(state, UPKEEP);
  ledger.tourism = state.tourism * MONTHS_PER_YEAR;
  ledger.bonds = state.bonds.reduce((sum, b) => sum + bondPayment(b), 0);
  return ledger;
}

export const ledgerIncome = (l: Ledger): number => l.residentialTax + l.commercialTax + l.industrialTax + l.tourism;
export const ledgerCosts = (l: Ledger): number => l.roads + l.police + l.fire + l.bonds + l.transit + l.utilities + l.landmarks;

/** Borrow $10,000; false if five bonds are already out. */
export function issueBond(state: CityState): boolean {
  if (state.bonds.length >= MAX_BONDS) return false;
  state.bonds.push({ principal: BOND_PRINCIPAL, rate: nextBondRate(state), yearsLeft: BOND_TERM });
  state.funds += BOND_PRINCIPAL;
  return true;
}

/** Pay off a bond early, if the treasury can cover what is still owed. */
export function repayBond(state: CityState, index: number): boolean {
  const bond = state.bonds[index];
  if (!bond || state.funds < bond.principal) return false;
  state.funds -= bond.principal;
  state.bonds.splice(index, 1);
  return true;
}

/** Pay each bond's yearly instalment; retire those that are paid off. */
function payBonds(state: CityState): void {
  for (const b of state.bonds) {
    b.principal -= Math.round(b.principal / b.yearsLeft);
    b.yearsLeft--;
  }
  state.bonds = state.bonds.filter((b) => b.yearsLeft > 0 && b.principal > 0);
}

/**
 * Close the year on its last tick: collect taxes, pay running costs and
 * bond instalments, and report the books. A city in the red borrows once;
 * one that can borrow no more goes bankrupt.
 */
export function budgetSystem(emit: (event: SimEvent) => void): System {
  return {
    name: 'budget',
    phaseTicks: [TICKS_PER_MONTH - 1],
    run(state) {
      if (state.date.month !== MONTHS_PER_YEAR - 1) return;
      const ledger = computeLedger(state);
      ledger.construction = state.constructionThisYear;
      payBonds(state);
      const net = ledgerIncome(ledger) - ledgerCosts(ledger);
      state.funds += net;
      state.lastYear = ledger;
      state.constructionThisYear = 0;
      emit({ type: 'yearBudget', year: state.date.year, ledger, net });

      if (state.funds < 0 && !issueBond(state) && !state.bankrupt) {
        state.bankrupt = true;
        emit({ type: 'bankrupt' });
      }
    },
  };
}
