/**
 * Webview components index.
 */

export { WEBVIEW_STYLES } from './styles';
export { WEBVIEW_SCRIPTS } from './scripts';
export { WEBVIEW_MODALS } from './html';
export { ICONS, icon, ICONS_CSS } from './icons';

/**
 * Generates complete HTML content for the webview.
 */
export function generateWebviewHtml(): string {
  const { WEBVIEW_STYLES } = require('./styles');
  const { WEBVIEW_SCRIPTS } = require('./scripts');
  const { WEBVIEW_MODALS } = require('./html');
  const { ICONS_CSS } = require('./icons');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Pe4King Generator</title>
  <style>${WEBVIEW_STYLES}${ICONS_CSS}</style>
</head>
<body>
  <h2>Pe4King Generator</h2>
  <div id="app"></div>
  ${WEBVIEW_MODALS}
  <script>${WEBVIEW_SCRIPTS}</script>
</body>
</html>`;
}
