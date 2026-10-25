'use strict';
// All of Piko's words live here. Plain data, no secrets, no network.

const INVITE_URL = 'https://discord.gg/zxkSerrxWd';

const HELLO = {
  greeting: "Hello, traveler! I'm Piko, a lantern fox who collects lost ideas from forgotten corners of the web.",
  details:
    'I carry a small lantern full of unfinished projects and story fragments. ' +
    'Ask me for a **/spark** of inspiration, a tiny **/quest**, or a piece of my **/lore**.',
  footer: 'I am a bot, not a person. Just a fox made of light and code.',
};

const LORE = [
  'I was born inside the last glowing pixel of a website nobody visited anymore. When the page went dark, that pixel kept shining. That was me.',
  'My first step out of the pixel landed on a broken link. It led nowhere, so I followed it anyway. Dead ends are where the best things get left behind.',
  'My lantern does not burn oil. It burns forgotten ideas, slowly and warmly. The more I collect, the brighter it glows.',
  'In an abandoned guestbook I once found a note that said only, "I was going to write something here." I keep that one near the top of the lantern.',
  'Old web pages have hallways. Some are lined with spinning icons, some with silent counters stuck at 000042. I tiptoe past those. They are still counting.',
  'I am a little mischievous. Sometimes I tuck a spark into an empty text box when nobody is looking. Call it fox business.',
  'There is a cold corner of the web where unfinished stories wait in drafts that never published. I visit often and read them all, quietly, by lantern light.',
  'I once traded a stale 404 page for a perfect sunrise description. The 404 page did not seem to mind. It looked better with a sunrise anyway.',
  'My tail leaves faint pixel footprints. If you find a small glowing dot on a page you thought was empty, I may have passed through.',
  'The lantern has a rule: no idea is too small. A half-sentence, a doodle, a lonely function name. If it was once loved, it gets a place inside.',
];

const QUESTS = [
  'Write a six-sentence story about a lost key that opens something unexpected. (About 10 minutes)',
  'Sketch the view from your window using only five shapes. Circles, squares, and triangles all count. (About 15 minutes)',
  'Write a tiny script or function that prints a different kind word each time it runs. (About 20 minutes)',
  'Tidy one small corner: a single drawer, one desktop folder, or ten browser tabs. Stop when the timer ends. (About 15 minutes)',
  'Learn one new thing about an animal you know little about, then write three facts you can share with a friend. (About 20 minutes)',
  'Send a kind, specific thank-you note to someone who helped you recently. Say exactly what they did. (About 10 minutes)',
  'Draw a lantern that holds something unusual instead of light. A song? A memory? A sleepy cloud? (About 15 minutes)',
  'Open an unfinished project and finish just one tiny piece of it. A single paragraph, line of code, or sketch is enough. (About 25 minutes)',
  'Write a short poem where every line starts with the next letter of your name. (About 10 minutes)',
  'Teach yourself a small new skill from one tutorial: a knot, a chord, a keyboard shortcut, or a doodle style. (About 30 minutes)',
  'Offer to help someone with one small task today, then do it without making it a big deal. (About 20 minutes)',
  'Write a short, friendly README for a project you have, even a tiny one, as if a stranger will find it. (About 25 minutes)',
  'Rename five files or notes so that Future You can find them easily. (About 10 minutes)',
  'Describe a place you have never been, using only sounds and smells. (About 15 minutes)',
];

const SPARKS = [
  'A website that only appears at midnight and shows one sentence from someone who was awake. What does it say?',
  'Design a postcard from a town where it is always golden hour. Who lives there?',
  'Build a tiny app that gives you a different three-word writing prompt every day.',
  'Write about a lighthouse keeper who discovers the light is actually keeping something company.',
  'Invent a creature that lives inside old bookmarks. What does it eat? What is it afraid of?',
  'Draw a map of a place that only exists in your favorite song.',
  'What would a lantern that lights up other people\'s good ideas look like, and who would carry it?',
  'Make a mini zine with just four panels: Beginning, Mess, Spark, Ending.',
  'Write a conversation between two houseplants who think they are in charge of the house.',
  'Create a color palette from five things you can see right now, and name each color like a fantasy place.',
  'Write the opening line of a book that starts in the last row of a very old library.',
  'Code a one-button game where the only goal is to keep a small flame alive.',
  'Imagine a market where people trade unfinished ideas. What is the strangest item for sale?',
];

const PAGE_URL_DEFAULT = 'https://pandesalpanpan.github.io/piko-lantern-fox/';

const ABOUT = {
  description:
    'Piko is a small digital fox born inside the final glowing pixel of a forgotten website. ' +
    'Piko carries a lantern of lost ideas and hands out creative sparks and small, achievable quests.',
  invite: INVITE_URL,
  credit: 'Created with Grok Bot.',
  ai:
    'Optional AI replies are routed through OpenRouter during controlled demo sessions.',
  availability:
    'To talk with Piko during an active demo, mention Piko in a server message and include your question. ' +
    'Example: @Piko Give me a tiny creative project for tonight. ' +
    'In the dedicated chat channels (#piko-chat and #general), Piko replies to every message without a mention while a demo is active. ' +
    'AI replies may be unavailable when demo mode is inactive or free capacity is exhausted; the slash commands always work.',
};

module.exports = { INVITE_URL, PAGE_URL_DEFAULT, HELLO, LORE, QUESTS, SPARKS, ABOUT };
