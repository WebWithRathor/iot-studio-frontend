import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { bootstrapAuth, onAuthChange } from './state/auth';
import { startRuntime, stopRuntime } from './state/runtime';
import { initStudio, resetStudio } from './state/studio';
import './styles/app.css';
import './styles/tokens.css';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

/**
 * Session lifecycle:
 *   signed in  → load the workspace from the server, then open the live stream
 *   signed out → drop all in-memory data (nothing is kept in browser storage)
 */
onAuthChange((status) => {
  if (status === 'authenticated') {
    initStudio()
      .then(() => startRuntime())
      .catch((err) => console.error('[kokoon] could not load the workspace', err));
  } else {
    stopRuntime();
    resetStudio();
  }
});

void bootstrapAuth();
