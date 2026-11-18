import type { Speed } from '@/shared/constants';
import type { SimCommand } from '@/shared/protocol';
import { BudgetWindow } from './BudgetWindow';
import { CityReport } from './CityReport';
import { NewsTicker } from './NewsTicker';
import { GameOver } from './GameOver';
import { QueryPanel } from './QueryPanel';
import { RciMeter } from './RciMeter';
import { SpeedControls } from './SpeedControls';
import { CostTag, Toasts } from './Toasts';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';

interface AppProps {
  webglError: string | null;
  onSpeed: (speed: Speed) => void;
  send: (command: SimCommand) => void;
  onBudgetClose: () => void;
  onShowMe: (x: number, y: number) => void;
}

export function App({ webglError, onSpeed, send, onBudgetClose, onShowMe }: AppProps) {
  return (
    <>
      <TopBar />
      <Toolbar />
      <SpeedControls onSpeed={onSpeed} />
      <RciMeter />
      <QueryPanel />
      <Toasts />
      <CostTag />
      <NewsTicker onShowMe={onShowMe} />
      <BudgetWindow send={send} onClose={onBudgetClose} />
      <CityReport onShowMe={onShowMe} />
      <GameOver />
      {webglError !== null && (
        <p class="panel notice" role="alert">
          Tim City needs WebGL2, and this browser could not start it. Try a current
          version of Chrome, Edge, Firefox or Safari with hardware acceleration on.
        </p>
      )}
    </>
  );
}
