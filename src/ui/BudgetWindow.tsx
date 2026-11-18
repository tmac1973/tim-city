import type { Funding, Ledger, SimCommand } from '@/shared/protocol';
import { BOND_PRINCIPAL, MAX_BONDS, bondPayment, ledgerCosts, ledgerIncome } from '@/sim/systems/budget';
import { autoBudget, budget, budgetOpen, formatMoney, funds } from './store';

interface Props {
  send: (command: SimCommand) => void;
  onClose: () => void;
}

const INCOME: [keyof Ledger, string][] = [
  ['residentialTax', 'Residential taxes'],
  ['commercialTax', 'Commercial taxes'],
  ['industrialTax', 'Industrial taxes'],
  ['tourism', 'Tourism'],
];
const COSTS: [keyof Ledger, string][] = [
  ['roads', 'Roads and rail'],
  ['police', 'Police'],
  ['fire', 'Fire'],
  ['transit', 'Transit'],
  ['utilities', 'Water and garbage'],
  ['landmarks', 'Landmarks'],
  ['bonds', 'Bond payments'],
];
const SERVICES: [keyof Funding, string][] = [
  ['road', 'Roads and rail'],
  ['police', 'Police'],
  ['fire', 'Fire'],
  ['transit', 'Transit'],
  ['utilities', 'Water and garbage'],
];

const net = (l: Ledger, withConstruction: boolean) => ledgerIncome(l) - ledgerCosts(l) - (withConstruction ? l.construction : 0);
/** Rows that are always shown; the others appear once they carry money. */
const ALWAYS = new Set<keyof Ledger>(['residentialTax', 'commercialTax', 'industrialTax', 'roads', 'police', 'fire', 'bonds']);

/** Yearly budget: tax rate, service funding, the books, and bonds. */
export function BudgetWindow({ send, onClose }: Props) {
  const b = budget.value;
  if (!budgetOpen.value || !b) return null;
  const last = b.lastYear;
  const est = b.estimate;
  const cell = (l: Ledger | null, key: keyof Ledger) => (l ? formatMoney(l[key]) : '—');
  const shown = (key: keyof Ledger) => ALWAYS.has(key) || (last?.[key] ?? 0) !== 0 || est[key] !== 0;

  return (
    <div class="modal-backdrop">
      <section class="budget panel" role="dialog" aria-label="Budget">
        <header>
          <h2>Budget</h2>
          <span class="treasury">Treasury {formatMoney(funds.value)}</span>
        </header>

        <div class="budget-grid">
          <div class="budget-controls">
            <label class="slider">
              <span>
                Tax rate <strong>{b.taxRate}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={20}
                value={b.taxRate}
                aria-label="Tax rate"
                onInput={(e) => { send({ type: 'setTaxRate', rate: Number(e.currentTarget.value) }); }}
              />
              <small>Above 7% slows growth; below it attracts people.</small>
            </label>
            {SERVICES.map(([service, label]) => (
              <label class="slider" key={service}>
                <span>
                  {label} funding <strong>{b.funding[service]}%</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={b.funding[service]}
                  aria-label={`${label} funding`}
                  onInput={(e) => { send({ type: 'setFunding', service, percent: Number(e.currentTarget.value) }); }}
                />
              </label>
            ))}
          </div>

          <table class="ledger">
            <thead>
              <tr>
                <th />
                <th>Last year</th>
                <th>Next year</th>
              </tr>
            </thead>
            <tbody>
              {INCOME.filter(([key]) => shown(key)).map(([key, label]) => (
                <tr key={key} data-row={key}>
                  <td>{label}</td>
                  <td>{cell(last, key)}</td>
                  <td>{cell(est, key)}</td>
                </tr>
              ))}
              {COSTS.filter(([key]) => shown(key)).map(([key, label]) => (
                <tr key={key} class="cost">
                  <td>{label}</td>
                  <td>{cell(last, key)}</td>
                  <td>{cell(est, key)}</td>
                </tr>
              ))}
              <tr class="cost">
                <td>Construction</td>
                <td>{cell(last, 'construction')}</td>
                <td>{formatMoney(b.constructionThisYear)} so far</td>
              </tr>
              <tr class="total">
                <td>Net</td>
                <td>{last ? formatMoney(net(last, true)) : '—'}</td>
                <td>{formatMoney(net(est, false))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bonds">
          <h3>Bonds</h3>
          {b.bonds.length === 0 && <p class="muted">No bonds outstanding.</p>}
          {b.bonds.map((bond, i) => (
            <div class="bond" key={i}>
              <span>
                {formatMoney(bond.principal)} at {(bond.rate * 100).toFixed(0)}% · {bond.yearsLeft} years left · {formatMoney(bondPayment(bond))}/year
              </span>
              <button type="button" disabled={funds.value < bond.principal} onClick={() => { send({ type: 'repayBond', index: i }); }}>
                Repay
              </button>
            </div>
          ))}
          <button
            type="button"
            class="issue"
            disabled={b.bonds.length >= MAX_BONDS}
            onClick={() => { send({ type: 'issueBond' }); }}
          >
            Borrow {formatMoney(BOND_PRINCIPAL)} at {5 + b.bonds.length}% for 10 years
          </button>
        </div>

        <footer>
          <label class="check">
            <input type="checkbox" checked={autoBudget.value} onChange={(e) => (autoBudget.value = e.currentTarget.checked)} />
            Open every year end
          </label>
          <button type="button" class="primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
