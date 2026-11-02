import type { Direction } from '../../types/models';

/**
 * PROPOSED topic convention — not a contract. The LMS MQTT block is the
 * authority on real topics. Every device has a server-assigned namespace
 * (`device.topicPrefix`); the backend rejects variable topics outside it.
 *
 *   {prefix}/telemetry/{key}    device → dashboard (value / reported state)
 *   {prefix}/command/{key}      dashboard → device
 *   {prefix}/ack/{key}          device acknowledgement of a command
 *   {prefix}/availability       online / offline (Last Will)
 */
export const topics = {
  telemetry: (prefix: string, key: string) => `${prefix}/telemetry/${key}`,
  command: (prefix: string, key: string) => `${prefix}/command/${key}`,
  ack: (prefix: string, key: string) => `${prefix}/ack/${key}`,
  availability: (prefix: string) => `${prefix}/availability`,
};

export function suggestTopics(prefix: string, key: string, direction: Direction) {
  return {
    stateTopic: direction !== 'command' ? topics.telemetry(prefix, key) : undefined,
    commandTopic: direction !== 'telemetry' ? topics.command(prefix, key) : undefined,
  };
}

/** Namespace for variables without a device (nothing is routed there). Matches the backend. */
export const sandboxPrefix = (topicRoot: string, userId: string) => `${topicRoot}/sandbox-${userId}`;

/** Validation for user-entered topics (mirrors the backend; the server re-validates). */
export function validateTopic(topic: string): string | null {
  if (!topic.trim()) return 'Enter a topic.';
  if (/\s/.test(topic)) return 'Topics cannot contain spaces.';
  if (/[+#]/.test(topic)) return 'Wildcards (+, #) are only allowed in subscriptions, not in a variable topic.';
  if (topic.startsWith('/') || topic.endsWith('/')) return 'Remove the leading or trailing “/”.';
  if (topic.includes('//')) return 'Topics cannot contain empty levels (“//”).';
  if (!/^[A-Za-z0-9_\-./]+$/.test(topic)) return 'Use letters, digits, “_”, “-”, “.” and “/” only.';
  if (topic.length > 200) return 'Keep topics under 200 characters.';
  return null;
}
