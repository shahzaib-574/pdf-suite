import { useEffect, useState } from 'react';
import './motion/gsapSetup';
import { BottomNav, type BottomNavTab } from './components';
import type { Route } from './lib/types';
import { Home } from './screens/Home';
import { Recents } from './screens/Recents';
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
      <div className="app-frame">
        <div className="route-stage" key={routeKey(route)}>
          <RouteView route={route} />
        </div>
        <BottomNav activeTab={activeNavTab(route)} />
      </div>
    </ThemeProvider>
  );
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'recents':
      return <Recents />;
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

function routeKey(route: Route): string {
  if (route.name === 'tool') return `${route.name}-${route.id}`;
  if (route.name === 'viewer') return `${route.name}-${route.recentId ?? 'memory'}`;
  return route.name;
}

function activeNavTab(route: Route): BottomNavTab | undefined {
  if (route.name === 'home') return 'tools';
  if (route.name === 'recents') return 'recents';
  if (route.name === 'settings') return 'settings';
  if (route.name === 'tool' && route.id === 'scan') return 'camera';
  if (route.name === 'tool' && route.id === 'pdf-docx') return 'extract';
  return undefined;
}
