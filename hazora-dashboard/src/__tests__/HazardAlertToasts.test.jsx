import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HazardAlertToasts from '../components/HazardAlertToasts';

describe('HazardAlertToasts', () => {
  it('uses red for high hazards, yellow for warnings, and green for safe states', () => {
    const markup = renderToStaticMarkup(createElement(HazardAlertToasts, {
      notifications: [
        { id: 'high', severity: 'high', violationType: 'Missing helmet', message: 'Wear a hard hat.' },
        { id: 'medium', severity: 'medium', violationType: 'Missing shoes' },
        { id: 'safe', severity: 'safe', violationType: 'Compliant' },
      ],
      onDismiss: () => {},
    }));

    expect(markup).toContain('hazard-alert-critical');
    expect(markup).toContain('hazard-alert-warning');
    expect(markup).toContain('hazard-alert-safe');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Missing helmet');
    expect(markup).toContain('Wear a hard hat.');
  });
});
