import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AndroidAppPage from '../components/AndroidAppPage';

describe('AndroidAppPage', () => {
  it('shows the camera app release destination alongside the HAZORA app', () => {
    const markup = renderToStaticMarkup(createElement(AndroidAppPage));

    expect(markup).toContain('HAZORA App');
    expect(markup).toContain('HAZORA Camera App');
    expect(markup).toContain('https://github.com/haruto-web/Hazora-Mobile-Camera/releases');
    expect(markup.match(/class="android-app-content"/g)).toHaveLength(2);
    expect(markup).toContain('View camera app releases');
    expect(markup).toContain('latest pre-release');
    expect(markup).toContain('enter its displayed IP address');
  });
});
