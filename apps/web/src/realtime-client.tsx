import { initRealtimeClient } from 'rwsdk/realtime/client';
import './global.css';

const key = window.location.pathname;

initRealtimeClient({
  key,
});
