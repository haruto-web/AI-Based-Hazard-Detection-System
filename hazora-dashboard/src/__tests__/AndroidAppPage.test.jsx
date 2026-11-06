import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AndroidAppPage from '../components/AndroidAppPage';

describe('AndroidAppPage', () => {
  it('shows the camera app release destination alongside the HAZORA app', () => {
    const markup = renderToStaticMarkup(createElement(AndroidAppPage));
    const cameraDownloadUrl =
      import.meta.env.VITE_ANDROID_CAMERA_APP_DOWNLOAD_URL?.trim() || '';

    expect(markup).toContain('HAZORA App');
    expect(markup).toContain('HAZORA Camera App');
    expect(markup.match(/class="android-app-content"/g)).toHaveLength(2);
    expect(markup).toContain(
      cameraDownloadUrl
        ? `href="${cameraDownloadUrl}"`
        : 'Download unavailable'
    );
    expect(markup).toContain('v1.1.0 pre-release APK');
    expect(markup).toContain('enter its displayed IP address');
  });
});
