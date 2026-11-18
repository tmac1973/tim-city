import type { Speed } from '@/shared/constants';
import type { SimCommand } from '@/shared/protocol';
import { BudgetWindow } from './BudgetWindow';
import { CityReport } from './CityReport';
import { DisasterMenu } from './DisasterMenu';
import { FollowHud } from './FollowHud';
import { TipBubble } from './onboarding/TipBubble';
import { type NewCityOptions, NewCityScreen } from './screens/NewCityScreen';
import { PauseMenu } from './screens/PauseMenu';
import { SettingsWindow } from './screens/SettingsWindow';
import { TitleScreen } from './screens/TitleScreen';
import { newCityOpen, screen } from './store';
import type { MapSize } from '@/shared/constants';
import type { TerrainOptions } from '@/shared/protocol';
import { GraphsWindow } from './GraphsWindow';
import { OverlayPanel } from './OverlayPanel';
import { type SaveActions, SaveLoadWindow } from './SaveLoadWindow';
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
  bindMinimap: (canvas: HTMLCanvasElement) => void;
  requestHistory: () => void;
  saves: SaveActions;
  follow: { next: () => void; stop: () => void };
  title: {
    preview: (seed: string, size: MapSize, terrain: TerrainOptions) => Promise<{ size: MapSize; heights: Uint8Array; tiles: Uint16Array }>;
    start: (options: NewCityOptions) => void;
    resume: () => void;
    quit: () => void;
  };
}

export function App({ webglError, onSpeed, send, onBudgetClose, onShowMe, bindMinimap, requestHistory, saves, follow, title }: AppProps) {
  if (screen.value === 'title') {
    return (
      <>
        <TitleScreen onContinue={saves.load} />
        {newCityOpen.value && <NewCityScreen preview={title.preview} onStart={title.start} />}
        <SaveLoadWindow actions={saves} />
        <SettingsWindow />
        <Toasts />
        {webglError !== null && (
          <p class="panel notice" role="alert">
            Tim City needs WebGL2, and this browser could not start it. Try a current
            version of Chrome, Edge, Firefox or Safari with hardware acceleration on.
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <TopBar />
      <Toolbar />
      <SpeedControls onSpeed={onSpeed} />
      <RciMeter />
      <OverlayPanel bindMinimap={bindMinimap} />
      <QueryPanel />
      <Toasts />
      <CostTag />
      <NewsTicker onShowMe={onShowMe} />
      <BudgetWindow send={send} onClose={onBudgetClose} />
      <CityReport onShowMe={onShowMe} />
      <GraphsWindow request={requestHistory} />
      <SaveLoadWindow actions={saves} />
      <DisasterMenu send={send} />
      <FollowHud onNext={follow.next} onStop={follow.stop} />
      <TipBubble />
      <PauseMenu onResume={title.resume} onQuit={title.quit} />
      <SettingsWindow />
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
