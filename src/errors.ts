/**
 * Structured errors — every failure carries enough context to act on.
 *
 * The platform's debugging history shows that silent or generic failures
 * ("Correlation timed out") cost days; these errors exist so the SDK can
 * tell users WHAT failed and WHERE, at the call site that caused it.
 */

/** A payload could not be msgpack-encoded (e.g. class instances, cycles). */
export class NoLagEncodeError extends Error {
  readonly op: string;
  readonly topic?: string;

  constructor(op: string, topic: string | undefined, cause: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(
      `Cannot encode payload for ${op}${topic ? ` to '${topic}'` : ""}: ${causeMsg}. ` +
        `Payloads must be plain msgpack-serializable data (no class instances, ` +
        `Promises, functions, or circular references).`
    );
    this.name = "NoLagEncodeError";
    this.op = op;
    this.topic = topic;
  }
}

/** A structured error frame sent by the broker. */
export class NoLagServerError extends Error {
  readonly code?: number;
  readonly error: string;
  readonly topic?: string;
  readonly hint?: string;
  readonly msgRef?: string;

  constructor(frame: {
    code?: number;
    error: string;
    topic?: string;
    hint?: string;
    msgRef?: string;
  }) {
    super(
      `${frame.error}${frame.code ? ` (${frame.code})` : ""}` +
        `${frame.topic ? ` on '${frame.topic}'` : ""}` +
        `${frame.hint ? ` — ${frame.hint}` : ""}`
    );
    this.name = "NoLagServerError";
    this.code = frame.code;
    this.error = frame.error;
    this.topic = frame.topic;
    this.hint = frame.hint;
    this.msgRef = frame.msgRef;
  }
}
