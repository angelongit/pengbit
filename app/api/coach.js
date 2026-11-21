import { handle, cleanPet } from './_llm.js';
import { coachPrompt } from './_prompts.js';

const SITUATIONS = ['nudge', 'moved', 'checkin'];
export default (req, res) => handle(req, res, (b) => coachPrompt(cleanPet(b.pet), SITUATIONS.includes(b.situation) ? b.situation : 'checkin'));
