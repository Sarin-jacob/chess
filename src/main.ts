import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
}

export default app;

// Handy for poking at the game from the console while developing.
if (import.meta.env.DEV) import('./lib/game.svelte').then(({ game }) => Object.assign(window, { game }));
