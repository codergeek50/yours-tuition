import { render } from 'preact';
import { App } from './App';
import '@fontsource-variable/dm-sans/opsz.css';
import '@fontsource-variable/inter/opsz.css';
import './styles.css';

render(<App />, document.getElementById('app')!);
