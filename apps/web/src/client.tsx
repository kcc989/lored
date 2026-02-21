import { initClient, initClientNavigation } from 'rwsdk/client';
import './global.css';

const { handleResponse, onHydrated } = initClientNavigation();
initClient({ handleResponse, onHydrated });
