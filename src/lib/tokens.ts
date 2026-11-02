import type { Dashboard, Project, TokenCosts } from '../types/models';

/**
 * Token budget math — a mirror of the backend's token-wallet.service.ts so
 * the editor can show the live balance and refuse an add instantly. The
 * server re-checks every save; this copy only shapes the UI.
 */

export const DEFAULT_COSTS: TokenCosts = { project: 200, dashboard: 100, widget: 100 };

export const chargedWidgets = (widgets: number, freeWidgets = 0) => Math.max(0, widgets - Math.max(0, freeWidgets));

export function computeUsage(projects: Pick<Project, 'id' | 'sample'>[], dashboards: Pick<Dashboard, 'projectId' | 'widgets' | 'freeWidgets'>[], costs: TokenCosts = DEFAULT_COSTS) {
  const sample = new Map(projects.map((p) => [p.id, Boolean(p.sample)]));
  const perProject = new Map<string, number>();
  let widgets = 0;
  let free = 0;
  for (const d of dashboards) {
    if (!sample.has(d.projectId)) continue;
    perProject.set(d.projectId, (perProject.get(d.projectId) ?? 0) + 1);
    const charged = chargedWidgets(d.widgets.length, d.freeWidgets);
    widgets += charged;
    free += d.widgets.length - charged;
  }
  let projectCount = 0;
  let extraDashboards = 0;
  for (const [id, isSample] of sample) {
    if (!isSample) projectCount++;
    extraDashboards += Math.max(0, (perProject.get(id) ?? 1) - 1);
  }
  const breakdown = {
    projects: { count: projectCount, tokens: projectCount * costs.project },
    dashboards: { count: extraDashboards, tokens: extraDashboards * costs.dashboard },
    widgets: { count: widgets, tokens: widgets * costs.widget, free },
  };
  return { used: breakdown.projects.tokens + breakdown.dashboards.tokens + breakdown.widgets.tokens, breakdown };
}

/** Cost of a project graph (create / duplicate / import). */
export const graphCost = (widgetsPerDashboard: number[], costs: TokenCosts = DEFAULT_COSTS) =>
  costs.project + Math.max(0, widgetsPerDashboard.length - 1) * costs.dashboard + widgetsPerDashboard.reduce((n, w) => n + w, 0) * costs.widget;

export const formatTokens = (n: number) => Math.round(n).toLocaleString('en-IN');
