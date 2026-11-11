/**
 * lib/prep/senderRule.ts — one rule for every prompt that writes something the founder will send.
 * Without it a draft can hand the founder's own news to the reader ("I noticed you just got two users")
 * or claim to have seen something about a stranger.
 */
export const SENDER_RULE = `The founder is the SENDER. Facts about the founder, their product, signups or milestones are the founder's: write them in the first person ("I just got my first two users"), never as facts about the reader. Never say you saw, noticed, read or heard anything about the reader unless the text above states exactly that.`;
