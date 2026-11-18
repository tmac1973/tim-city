import { Icon } from './icons';
import {
  budgetOpen,
  census,
  cityInfo,
  date,
  evaluation,
  formatCount,
  formatDate,
  formatMoney,
  funds,
  graphsOpen,
  reportOpen,
  toast,
} from './store';

export function TopBar() {
  const info = cityInfo.value;
  const copySeed = () => {
    if (!info) return;
    navigator.clipboard.writeText(info.seed).then(
      () => {
        toast(`Seed "${info.seed}" copied`, 'info');
      },
      () => {
        toast('Could not copy the seed');
      },
    );
  };

  return (
    <header class="topbar panel">
      <h1 class="logo">Tim City</h1>
      <span class="divider" />
      <span class="city-name">{info?.name ?? '…'}</span>
      <span class="stat" title="Date">
        {formatDate(date.value)}
      </span>
      <span class="stat population" title="Population" data-testid="population">
        Pop. {formatCount(census.value?.resPop ?? 0)}
      </span>
      <span class={funds.value < 0 ? 'stat money negative' : 'stat money'} title="City funds" data-testid="funds">
        {formatMoney(funds.value)}
      </span>
      <button class="topbar-button" type="button" onClick={() => (budgetOpen.value = true)}>
        Budget
      </button>
      <button class="topbar-button" type="button" onClick={() => (reportOpen.value = true)}>
        City{evaluation.value ? ` · ${String(evaluation.value.approval)}%` : ''}
      </button>
      <button class="topbar-button" type="button" onClick={() => (graphsOpen.value = true)}>
        Graphs
      </button>
      <span class="spacer" />
      {info && (
        <button class="seed" type="button" onClick={copySeed} title="Copy this map's seed to share it">
          <span class="seed-label">Seed</span>
          <span class="seed-value">{info.seed}</span>
          <Icon name="copy" />
        </button>
      )}
    </header>
  );
}
