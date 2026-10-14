let context: AudioContext | undefined
const activeNotes = new Set<OscillatorNode>()
const melody = [261.63, 329.63, 392, 440, 392, 329.63, 293.66, 261.63]
export const melodyNames = ['do', 'mi', 'sol', 'la', 'sol', 'mi', 're', 'do']
let sequenceVersion = 0

export function prepareLearningAudio(enabled: boolean): boolean {
  if (!enabled) return false
  try {
    if (!window.AudioContext) return false
    context ??= new window.AudioContext()
    if (context.state === 'suspended') void context.resume().catch(() => {})
    return true
  } catch {
    return false
  }
}

export function playLearningNote(enabled: boolean, index: number, celebration = false, delay = 0) {
  if (!enabled || !context || context.state !== 'running') return false
  try {
    const notes = celebration
      ? [melody[index % melody.length], 392, 523.25]
      : [melody[index % melody.length]]
    notes.forEach((frequency, noteIndex) => {
      const start = context!.currentTime + delay + noteIndex * 0.13
      // A short, quiet additive tone. No network, microphone, or endless background loop.
      for (const [harmonic, volume] of [
        [1, 0.075],
        [2, 0.021],
        [3, 0.009],
      ]) {
        const oscillator = context!.createOscillator()
        const envelope = context!.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency * harmonic
        envelope.gain.setValueAtTime(0, start)
        envelope.gain.linearRampToValueAtTime(volume, start + 0.012)
        envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.38)
        oscillator.connect(envelope)
        envelope.connect(context!.destination)
        oscillator.start(start)
        oscillator.stop(start + 0.4)
        activeNotes.add(oscillator)
        oscillator.onended = () => {
          activeNotes.delete(oscillator)
          oscillator.disconnect()
          envelope.disconnect()
        }
      }
    })
    return true
  } catch {
    return false
  }
}

export function silenceLearningAudio() {
  sequenceVersion += 1
  for (const oscillator of activeNotes) {
    try {
      oscillator.stop()
      oscillator.disconnect()
    } catch {
      /* Already-ended tones are harmless. */
    }
  }
  activeNotes.clear()
  if (context?.state === 'running') void context.suspend().catch(() => {})
}

export async function playLearningPhrase(enabled: boolean, start: number, length: number) {
  if (!enabled) return false
  silenceLearningAudio()
  if (!prepareLearningAudio(enabled) || !context) return false
  const ticket = sequenceVersion
  try {
    await context.resume()
    if (ticket !== sequenceVersion) return false
    for (let index = 0; index < Math.min(length, 8); index++)
      playLearningNote(true, start + index, false, index * 0.24)
    return true
  } catch {
    return false
  }
}
