import type { Speed } from '@/shared/constants';
import type { SimCommand } from '@/shared/protocol';
import { BudgetWindow } from './BudgetWindow';
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
}

export function App({ webglError, onSpeed, send, onBudgetClose }: AppProps) {
  return (
    <>
      <TopBar />
      <Toolbar />
      <SpeedControls onSpeed={onSpeed} />
      <RciMeter />
      <QueryPanel />
      <Toasts />
      <CostTag />
      <BudgetWindow send={send} onClose={onBudgetClose} />
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
