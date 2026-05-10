// Adjective + noun name generator for anonymous users.
// Stays simple, evocative, and unmistakably non-real-name (so no one
// confuses a generated name for a real person), while still feeling
// human and distinct between users.

const ADJECTIVES = [
	'quiet', 'brave', 'soft', 'bright', 'calm', 'bold', 'swift', 'kind',
	'wild', 'gentle', 'sharp', 'slow', 'deep', 'true', 'fair', 'light',
	'cool', 'warm', 'lucid', 'neat', 'plain', 'fresh', 'free', 'lone',
	'near', 'open', 'small', 'still', 'vivid', 'dusty', 'misty', 'rough',
	'humble', 'tender', 'patient', 'curious', 'silent', 'sturdy', 'eager', 'tidy'
];

const NOUNS = [
	'river', 'mountain', 'fox', 'owl', 'moth', 'fern', 'cloud', 'leaf',
	'stone', 'wave', 'tide', 'ember', 'rain', 'dusk', 'dawn', 'moss',
	'pine', 'lark', 'finch', 'hare', 'dove', 'bay', 'oak', 'peach',
	'plum', 'willow', 'sparrow', 'robin', 'reed', 'thorn', 'creek', 'meadow',
	'kite', 'wren', 'heron', 'bramble', 'cedar', 'maple', 'iris', 'beach'
];

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function generateRandomName(): string {
	const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	return `${capitalize(a)} ${capitalize(n)}`;
}
