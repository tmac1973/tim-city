interface AppProps {
  webglError: string | null;
}

export function App({ webglError }: AppProps) {
  return (
    <>
      <h1 class="title">Tim City</h1>
      {webglError !== null && (
        <p class="panel notice" role="alert">
          Tim City needs WebGL2, and this browser could not start it. Try a current
          version of Chrome, Edge, Firefox or Safari with hardware acceleration on.
        </p>
      )}
    </>
  );
}
