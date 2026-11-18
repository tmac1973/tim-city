import { cityInfo, gameOver } from './store';

/** Shown when the city runs out of money and can borrow no more. */
export function GameOver() {
  if (!gameOver.value) return null;
  const startOver = () => {
    const params = new URLSearchParams(location.search);
    params.set('seed', Math.random().toString(36).slice(2, 8));
    location.search = params.toString();
  };
  return (
    <div class="modal-backdrop">
      <section class="gameover panel" role="alertdialog" aria-label="City bankrupt">
        <h2>{cityInfo.value?.name ?? 'The city'} is bankrupt</h2>
        <p>
          The treasury is empty and no lender will issue another bond. Construction has stopped. You can keep
          watching the city, or start again on a new map.
        </p>
        <footer>
          <button type="button" onClick={() => (gameOver.value = false)}>
            Keep watching
          </button>
          <button type="button" class="primary" onClick={startOver}>
            Start a new city
          </button>
        </footer>
      </section>
    </div>
  );
}
