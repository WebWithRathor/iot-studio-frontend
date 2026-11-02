/** Options for "Add simulated device" — mirrors the backend's DEVICE_KITS (the server validates the choice). */
export const DEVICE_KITS: Record<string, { label: string }> = {
  sensor: { label: 'Sensor kit — temperature, humidity, light' },
  actuator: { label: 'Actuator kit — LED, motor, RGB' },
  garden: { label: 'Garden kit — soil moisture, pump, battery' },
  full: { label: 'Full bench — sensors + actuators' },
};

export const DEVICE_BOARDS = ['ESP32-S3 DevKitC', 'ESP32-C3 Mini', 'Kokoon BrainBoard', 'ESP32 WROOM-32'];
