import { useEffect, useState } from 'react';
import './motion/gsapSetup';
import { initializeMobileAds, setDiscoveryBannerVisible } from './ads/admob';
import { BottomNav, type BottomNavTab } from './components';
import { toolById } from './lib/catalog';
import type { Route } from './lib/types';
import { Home } from './screens/Home';
import { Recents } from './screens/Recents';
import { Result } from './screens/Result';
import { Settings } from './screens/Settings';
import { ToolFlow } from './screens/ToolFlow';
import { Viewer } from './screens/Viewer';
import { parseHash } from './screens/nav';
import './screens/screens.css';
import { pruneStagedNativeExports } from './store/files';
import { ThemeProvider } from './theme/ThemeProvider';

export default function App() {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    if (!window.location.hash || window.location.hash === '#') {
      window.history.replaceState({ reamDepth: 0 }, '', '#/');
    } else if (window.history.state?.reamDepth == null) {
      window.history.replaceState(
        { ...window.history.state, reamDepth: 0 },
        '',
        window.location.href,
      );
    }
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);

  useEffect(() => {
    void initializeMobileAds();
    void pruneStagedNativeExports();
  }, []);

  useEffect(() => {
    const isDiscovery = route.name === 'home' || route.name === 'recents';
    void setDiscoveryBannerVisible(isDiscovery);
  }, [route]);

  useEffect(() => {
    document.title = `${routeTitle(route)} · Ream`;
    window.scrollTo(0, 0);
    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('main h1, .ps-screen h1');
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route]);

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
  if (route.name === 'viewer' && route.recentId) return 'recents';
  return 'tools';
}

function routeTitle(route: Route): string {
  if (route.name === 'home') return 'Tools';
  if (route.name === 'recents') return 'Recent files';
  if (route.name === 'settings') return 'Settings';
  if (route.name === 'viewer') return 'Reader';
  if (route.name === 'result') return 'File ready';
  if (route.name === 'tool') return toolById(route.id)?.title ?? 'PDF tool';
  return 'PDF Suite';
}
