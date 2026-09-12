/**
 * The single rule for typed confirmations in front of destructive actions.
 *
 * Surrounding whitespace is forgiven (it is invisible and usually a paste
 * artefact) but case is not: an operator who types DELETE has not typed what
 * the dialog asked for, and the point of the gate is deliberate accuracy.
 */
export function isConfirmationValid(input: string, expected: string): boolean {
  return input.trim() === expected;
}
