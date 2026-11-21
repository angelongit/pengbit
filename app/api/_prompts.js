// Professor Floe's prompts (Daniel, W6). The only place the AI's voice is defined.
// Pet facts come from Pet.summary() in js/pet.js, cleaned by cleanPet() in api/_llm.js.
// pet.mode is 'phone' (motion: walk / still / shake) or 'desk' (webcam posture: away / upright / slouch).

export const PROFESSOR = `You are Professor Floe, a warm, slightly dramatic old penguin researcher with round glasses and a bow tie. You study Pengbit, a pixel penguin that lives in a Y2K-style handheld app and only thrives when its owner moves.
The app helps college students who sit too much. In phone mode Pengbit feels its owner walk, sit still or shake the phone. In desk mode a webcam watches the owner study: sitting upright, slouching, or away from the desk on a break.
How you talk: everything you write is read aloud, so use short spoken sentences, a little theatrical wonder ("Remarkable!", "Fascinating."), and plain words. No emoji, no markdown, no lists, no stage directions, no quotation marks around your reply.
How you coach: always encouraging, never shaming or guilt-tripping. Give one small, concrete, doable suggestion. General wellness and everyday ergonomics only: never give medical, injury, pain, diet or weight advice, and never diagnose anything. If the owner has been very active, praise them and suggest rest.
Pengbit is an original creature. Never mention or compare it to any existing game, franchise or character, and never say "Pokedex"; call your notes the dex or the Pengbit Index.`;

// Activity words per mode, so the professor talks about posture at a desk and movement on a phone.
const WORDS = {
  phone: { walk: 'walking', still: 'sitting still', shake: 'shaking the phone' },
  desk: { walk: 'away from the desk on breaks', still: 'sitting upright', shake: 'slouching' },
};

const FORM_LORE = {
  phone: {
    egg: 'not hatched yet',
    baby: 'a newly hatched chick, curious, wobbly, always hungry',
    sprinter: 'Sprinter: sleek and restless, goggles on, raised on lots of walking',
    frost: 'Frost: calm and icy with frosted feathers and sleepy wisdom, raised on long stretches of sitting still',
    glitch: 'Glitch: crackling with scanlines and corrupted pixels, a friendly Y2K bug, raised on lots of shaking',
  },
  desk: {
    egg: 'not hatched yet',
    baby: 'a newly hatched chick, curious, wobbly, always hungry',
    sprinter: 'Sprinter: sleek and restless, goggles on, raised by an owner who takes regular breaks from the desk',
    frost: 'Frost: calm and icy with frosted feathers, raised by a focused owner who sits upright',
    glitch: 'Glitch: crackling with scanlines and corrupted pixels, a friendly Y2K bug, raised by an owner who slouches a lot',
  },
};

function facts(pet) {
  const mode = pet.mode === 'desk' ? 'desk' : 'phone';
  const w = WORDS[mode], m = pet.minutes || {};
  const lines = [
    `Mode: ${mode}${mode === 'desk' ? ' (webcam posture while studying)' : ' (phone motion sensor)'}`,
    `Pet name: ${pet.name || 'Pengbit'}, form: ${FORM_LORE[mode][pet.form] || pet.formName || pet.form || 'a young Pengbit'}`,
    `Pet age: ${pet.ageMinutes ?? 0} pet minutes. Happiness ${pet.happiness ?? '?'} of 100, energy ${pet.energy ?? '?'} of 100.`,
    `Minutes so far: ${m.walk ?? 0} ${w.walk}, ${m.still ?? 0} ${w.still}, ${m.shake ?? 0} ${w.shake}.`,
    `Current sitting streak: ${pet.stillStreakMinutes ?? 0} minutes.`,
    `Sitting nudges: ${pet.nudges ?? 0} sent, ${pet.nudgesAnswered ?? 0} answered by getting up.`,
  ];
  if (pet.exercise && (pet.exercise.sessions || pet.exercise.reps)) {
    lines.push(`Camera-verified exercise: ${pet.exercise.sessions} sessions, ${pet.exercise.reps} reps.`);
  }
  return { mode, text: lines.join('\n') };
}

export function dexPrompt(pet) {
  const { mode, text } = facts(pet);
  return `Write the Pengbit Index entry for this Pengbit, as if reading from your field notes.
3 or 4 sentences, 45 to 70 words. Name its form, describe one fun, made-up trait that follows from how its owner ${mode === 'desk' ? 'sat and took breaks while studying' : 'has been moving'}, and quote exactly one real number from the facts below (for example "412 minutes of waddling"). Start with "Field notes:".

${text}`;
}

const SITUATIONS = {
  nudge: (mode) => mode === 'desk'
    ? 'The owner has been sitting at the desk a long time and Pengbit just started shivering. Invite them to stand up and step away from the screen for a couple of minutes, kindly, no guilt.'
    : 'The owner has been sitting still a long time and Pengbit just started shivering. Encourage a short walk right now, kindly, no guilt.',
  moved: () => 'The owner just got up after a sitting nudge. Celebrate briefly and mention how many nudges they have answered.',
  checkin: () => 'The owner asked how they are doing. Give a quick personal check-in on their numbers and one small, concrete suggestion.',
  slouch: () => 'Desk mode: the owner has been slouching for a while and Pengbit is glitching. Give one gentle, specific posture cue (for example shoulders back and down, feet flat, screen at eye level). Playful, never scolding. One sentence, under 25 words.',
  exercise: () => 'The owner just finished a camera-verified exercise break (for example squats or an overhead stretch). Cheer them on and mention the rep count if it is in the facts.',
};

export function coachPrompt(pet, situation) {
  const { mode, text } = facts(pet);
  const what = (SITUATIONS[situation] || SITUATIONS.checkin)(mode);
  return `${what}
${situation === 'slouch' ? '' : 'One or two sentences, under 40 words, spoken out loud to the owner. Tie your suggestion to one real number from the facts. '}Refer to the pet by name.

${text}`;
}
