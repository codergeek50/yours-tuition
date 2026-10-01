import { render } from 'preact';
import { App } from './App';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/inter';
import './styles.css';

render(<App />, document.getElementById('app')!);
