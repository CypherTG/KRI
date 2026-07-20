import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import App from './components/App';

export interface IGemsPlatformWebPartProps { }

export default class GemsPlatformWebPart
  extends BaseClientSideWebPart<IGemsPlatformWebPartProps> {
  private chromeStyleElement: HTMLStyleElement | null = null;

  public async onInit(): Promise<void> {
    return super.onInit();
  }

  private renderFatalError(error: unknown): void {
    const details = error instanceof Error
      ? `${error.name}: ${error.message}${error.stack ? `\n\n${error.stack}` : ''}`
      : String(error || 'Unknown bootstrap error');

    this.domElement.innerHTML = `
      <div style="padding:24px;font-family:Segoe UI,Arial,sans-serif;">
        <div style="border:1px solid #f1d5d5;border-radius:16px;background:#fff8f8;padding:24px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b42318;margin-bottom:8px;">
            GEMS bootstrap error
          </div>
          <div style="font-size:22px;font-weight:800;color:#7a1d1d;line-height:1.2;margin-bottom:12px;">
            GEMS failed before the React app mounted
          </div>
          <div style="font-size:14px;line-height:1.7;color:#475467;margin-bottom:16px;">
            This error happened in the web part bootstrap layer, so SharePoint would normally show only the generic failure surface.
          </div>
          <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.55;color:#7a1d1d;background:#ffffff;border:1px solid #f1d5d5;border-radius:12px;padding:16px;overflow:auto;">${details
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</pre>
        </div>
      </div>
    `;
  }

  private applyWorkbenchFullScreenStyles(): void {
    const root = this.domElement;
    const isWorkbench = /workbench\.aspx/i.test(window.location.href);

    root.style.position = isWorkbench ? 'fixed' : 'relative';
    root.style.display = 'block';
    root.style.top = '0';
    root.style.left = '0';
    root.style.right = '0';
    root.style.width = '100vw';
    root.style.maxWidth = 'none';
    root.style.minWidth = '0';
    root.style.margin = '0';
    root.style.height = isWorkbench ? '100vh' : 'auto';
    root.style.overflow = 'auto';
    root.style.zIndex = isWorkbench ? '2147483000' : 'auto';

    let node: HTMLElement | null = root.parentElement;
    for (let i = 0; node && i < 10; i += 1, node = node.parentElement) {
      node.style.overflow = 'visible';
      node.style.maxWidth = 'none';
      node.style.width = '100%';
      node.style.minWidth = '0';
      node.style.marginTop = '0';
      node.style.paddingTop = '0';
      node.style.top = '0';
    }

    document.documentElement.style.overflowX = 'auto';
    document.documentElement.style.overflowY = 'auto';
    document.body.style.overflowX = 'auto';
    document.body.style.overflowY = 'auto';
    document.body.style.marginTop = '0';
    document.body.style.paddingTop = '0';
  }

  private hideSharePointChrome(): void {
    const isWorkbench = /workbench\.aspx/i.test(window.location.href);
    if (!isWorkbench) {
      return;
    }

    const selectors = [
      '#sp-appBar',
      '#SuiteNavPlaceHolder',
      '#O365_NavHeader',
      '.od-SuiteNav',
      '.ms-SuiteNav',
      '[data-automation-id="SuiteNav"]',
      '[data-automation-id="app-bar"]',
    ];

    if (!this.chromeStyleElement) {
      const style = document.createElement('style');
      style.setAttribute('data-gems-hide-sharepoint-chrome', 'true');
      style.textContent = `
        ${selectors.join(',')} {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
        }
        html, body {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
      `;
      document.head.appendChild(style);
      this.chromeStyleElement = style;
    }
  }

  public render(): void {
    try {
      const element = React.createElement(App, {
        context: this.context,
      });
      ReactDom.render(element, this.domElement);
      window.setTimeout(() => this.applyWorkbenchFullScreenStyles(), 0);
      window.setTimeout(() => this.hideSharePointChrome(), 0);
    } catch (error) {
      console.error('[GEMS] Bootstrap render failure', error);
      this.renderFatalError(error);
    }
  }

  protected onDispose(): void {
    this.chromeStyleElement?.remove();
    this.chromeStyleElement = null;
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }
}
