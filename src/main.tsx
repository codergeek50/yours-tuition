import { render } from 'preact';
import { App } from './App';
import { CrashGuard } from './ui/CrashGuard';
import '@fontsource-variable/dm-sans/opsz.css';
import '@fontsource-variable/inter/opsz.css';
import './styles.css';

render(<CrashGuard><App /></CrashGuard>, document.getElementById('app')!);
