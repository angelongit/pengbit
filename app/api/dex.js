import { handle, cleanPet } from './_llm.js';
import { dexPrompt } from './_prompts.js';

export default (req, res) => handle(req, res, (b) => dexPrompt(cleanPet(b.pet)));
