/**
 * Composition root for frontend services.
 *   - Kokoon Backend: services/api (auth, projects, dashboards, devices, MQTT)
 *   - LMS (not integrated yet): mock discovery + mapping adapters
 */
import { MockLmsDiscoveryAdapter, MockVariableMappingService, type LmsDiscoveryAdapter, type VariableMappingService } from './integrations';

export const lmsDiscovery: LmsDiscoveryAdapter = new MockLmsDiscoveryAdapter();
export const variableMapping: VariableMappingService = new MockVariableMappingService();
