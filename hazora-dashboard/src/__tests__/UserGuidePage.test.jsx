import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import UserGuidePage from '../components/UserGuidePage';
import Sidebar from '../components/Sidebar';

describe('UserGuidePage', () => {
  it('explains the main website, mobile, and account-recovery workflows', () => {
    const markup = renderToStaticMarkup(createElement(UserGuidePage));

    expect(markup).toContain('HAZORA User Guide');
    expect(markup).toContain('Using the website');
    expect(markup).toContain('Using the mobile app');
    expect(markup).toContain('A website account is required before you can access the HAZORA mobile app');
    expect(markup).toContain('do not create a separate app account');
    expect(markup).toContain('Never share your password');
  });

  it('makes the guide available in the dashboard navigation', () => {
    const markup = renderToStaticMarkup(createElement(Sidebar, {
      activeView: 'guide',
      userRole: 'Site Safety Officer',
      onViewChange: () => {},
    }));

    expect(markup).toContain('aria-label="User Guide"');
    expect(markup).toContain('aria-current="page"');
  });
});
