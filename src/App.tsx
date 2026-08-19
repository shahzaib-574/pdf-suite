import { useEffect, useState } from 'react';
import './motion/gsapSetup';
import type { Route } from './lib/types';
import { Home } from './screens/Home';
import { Result } from './screens/Result';
import { Settings } from './screens/Settings';
import { ToolFlow } from './screens/ToolFlow';
import { Viewer } from './screens/Viewer';
import { navigate, parseHash } from './screens/nav';
import './screens/screens.css';
import { ThemeProvider } from './theme/ThemeProvider';

export { navigate };

export default function App() {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#/';
    }
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <ThemeProvider>
      <RouteView route={route} />
    </ThemeProvider>
  );
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'tool':
      return <ToolFlow key={route.id} id={route.id} />;
    case 'viewer':
      return <Viewer key={route.recentId ?? 'memory'} recentId={route.recentId} />;
    case 'result':
      return <Result />;
    case 'settings':
      return <Settings />;
  }
}
