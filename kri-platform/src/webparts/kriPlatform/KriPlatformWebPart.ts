import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import App from './components/App';
import launchCard from './assets/kairos-launch-card.png';
import { normalizeKriSiteUrl, setKriDataSiteUrlOverride } from './services/siteConfig';

export default class KriPlatformWebPart
  extends BaseClientSideWebPart<{}> {
  private launchRoot: HTMLDivElement | null = null;
  private isLaunched = false;
  private originalBodyStyle = '';
  private originalHtmlStyle = '';
  private originalBodyOverflow = '';
  private originalHtmlOverflow = '';
  private launchStylesCaptured = false;

  public async onInit(): Promise<void> {
    return super.onInit();
  }

  private ensureLaunchRoot(): HTMLDivElement {
    if (this.launchRoot) {
      return this.launchRoot;
    }

    const root = document.createElement('div');
    root.id = 'kri-platform-launch-root';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.width = '100vw';
    root.style.height = '100dvh';
    root.style.maxWidth = 'none';
    root.style.maxHeight = 'none';
    root.style.margin = '0';
    root.style.padding = '0';
    root.style.overflow = 'auto';
    root.style.background = 'transparent';
    root.style.zIndex = '2147483647';
    root.style.isolation = 'isolate';
    root.style.pointerEvents = 'auto';
    root.style.overscrollBehavior = 'contain';

    document.body.appendChild(root);
    this.launchRoot = root;
    return root;
  }

  private applyLaunchStyles(): void {
    if (!this.launchStylesCaptured) {
      this.originalBodyStyle = document.body.getAttribute('style') || '';
      this.originalHtmlStyle = document.documentElement.getAttribute('style') || '';
      this.originalBodyOverflow = document.body.style.overflow;
      this.originalHtmlOverflow = document.documentElement.style.overflow;
      this.launchStylesCaptured = true;
    }

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.width = '100%';
    document.documentElement.style.height = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
  }

  private restoreLaunchStyles(): void {
    if (this.originalHtmlStyle) {
      document.documentElement.setAttribute('style', this.originalHtmlStyle);
    } else {
      document.documentElement.removeAttribute('style');
    }

    if (this.originalBodyStyle) {
      document.body.setAttribute('style', this.originalBodyStyle);
    } else {
      document.body.removeAttribute('style');
    }

    document.documentElement.style.overflow = this.originalHtmlOverflow;
    document.body.style.overflow = this.originalBodyOverflow;
    this.launchStylesCaptured = false;
  }

  private isWorkbenchLaunch(): boolean {
    if (this.context.isServedFromLocalhost) return true;
    if (typeof window === 'undefined') return false;
    return /workbench\.aspx/i.test(window.location.href);
  }

  private renderLauncher(): void {
    this.restoreLaunchStyles();
    if (this.launchRoot) {
      ReactDom.unmountComponentAtNode(this.launchRoot);
      this.launchRoot.remove();
      this.launchRoot = null;
    }

    this.domElement.style.display = 'block';
    this.domElement.style.minHeight = 'unset';
    this.domElement.style.height = 'auto';

    const launcher = React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0',
          background: 'transparent',
          boxSizing: 'border-box',
        },
      },
        React.createElement(
          'div',
          {
            role: 'button',
            tabIndex: 0,
          onClick: () => {
            this.isLaunched = true;
            this.render();
          },
          onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              this.isLaunched = true;
              this.render();
            }
          },
          style: {
            width: '100%',
            height: '180px',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 1.6px 3.6px rgba(0,0,0,0.132), 0 0.3px 0.9px rgba(0,0,0,0.108)',
            border: '1px solid rgba(0,0,0,0.08)',
            cursor: 'pointer',
            outline: 'none',
            background: '#f5f5f5',
            flexShrink: 0,
          },
        },
        React.createElement('img', {
          src: launchCard,
          alt: 'Open KAIROS launch card',
          style: {
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          },
        }),
      ),
    );

    ReactDom.render(launcher, this.domElement);
  }

  private renderApp(): void {
    const element = React.createElement(App, {
      context: this.context,
    });
    const host = this.ensureLaunchRoot();
    this.domElement.style.display = 'none';
    ReactDom.render(element, host);
    window.setTimeout(() => this.applyLaunchStyles(), 0);
  }

  public render(): void {
    setKriDataSiteUrlOverride(normalizeKriSiteUrl(''));

    if (!this.isLaunched && !this.isWorkbenchLaunch()) {
      this.renderLauncher();
      return;
    }

    this.isLaunched = true;
    this.renderApp();
  }

  protected onDispose(): void {
    this.restoreLaunchStyles();
    if (this.launchRoot) {
      ReactDom.unmountComponentAtNode(this.launchRoot);
      this.launchRoot.remove();
      this.launchRoot = null;
    }
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }
}
