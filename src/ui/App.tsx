import type { Speed } from '@/shared/constants';
import { SpeedControls } from './SpeedControls';
import { CostTag, Toasts } from './Toasts';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';

interface AppProps {
  webglError: string | null;
  onSpeed: (speed: Speed) => void;
}

export function App({ webglError, onSpeed }: AppProps) {
  return (
    <>
      <TopBar />
      <Toolbar />
      <SpeedControls onSpeed={onSpeed} />
      <Toasts />
      <CostTag />
      {webglError !== null && (
        <p class="panel notice" role="alert">
          Tim City needs WebGL2, and this browser could not start it. Try a current
          version of Chrome, Edge, Firefox or Safari with hardware acceleration on.
        </p>
      )}
    </>
  );
}
