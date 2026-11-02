/**
 * Integration boundaries with the Kokoon LMS that are NOT implemented yet.
 *
 * Authentication, projects, devices and MQTT now go through Kokoon Backend
 * (see services/api). The LMS API, its MQTT-block format and program
 * discovery have not been inspected, so these two adapters stay mocks and
 * are labelled as such in the UI.
 */
import type { LmsProgramRef, Variable, VariableTemplate } from '../types/models';

export interface LmsProgramSummary extends LmsProgramRef {
  declaredVariables: VariableTemplate[];
  updatedAt: number;
}

export interface LmsDiscoveryAdapter {
  listPrograms(): Promise<LmsProgramSummary[]>;
}

const DAY = 86_400_000;

export class MockLmsDiscoveryAdapter implements LmsDiscoveryAdapter {
  async listPrograms(): Promise<LmsProgramSummary[]> {
    const now = Date.now();
    return [
      { programId: 'lms_prog_room_v2', name: 'Room Monitor v2', version: 'r14', source: 'mock', updatedAt: now - 2 * DAY, declaredVariables: [] },
      { programId: 'lms_prog_rover_pid', name: 'Rover PID Tuning', version: 'r6', source: 'mock', updatedAt: now - 6 * DAY, declaredVariables: [] },
      { programId: 'lms_prog_blink', name: 'Blink + Button (Lesson 3)', version: 'r2', source: 'mock', updatedAt: now - 15 * DAY, declaredVariables: [] },
    ];
  }
}

export interface VariableMappingService {
  describe(variable: Variable): string;
}

export class MockVariableMappingService implements VariableMappingService {
  describe(variable: Variable): string {
    return variable.firmwareRef
      ? `LMS block ${variable.firmwareRef.blockId} · ${variable.firmwareRef.variableName}`
      : 'Not linked — available once the LMS MQTT block integration exists';
  }
}
