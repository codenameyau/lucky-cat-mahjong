/* "Which Mahjong Tile Are You?" quiz: questions, scoring, Google Form submission, results and sharing. */

(function (root) {
  'use strict';

  var FORM_ACTION = 'https://docs.google.com/forms/d/e/1FAIpQLSe5Xq5gywjpKD9_218x9GJNXR-1qmhd8v9Ih6B4FnIjOkucQA/formResponse';

  // Google Form entry IDs. `result` is a dropdown whose options must match each tile's `name` exactly,
  // otherwise Google rejects the whole submission.
  var FORM_FIELDS = {
    name: 'entry.2005620554',
    instagram: 'entry.1065046570',
    zip: 'entry.1166974658',
    skill: 'entry.839337160',
    result: 'entry.409406812',
  };

  var SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
  var STORAGE_KEY = 'lcm-tile-quiz';
  var SITE_URL = 'https://luckycatmahjong.com/which-mahjong-tiles-are-you/';

  var TILES = [
    {
      id: 'bamboo-1',
      name: '1 Bamboo',
      chinese: '一索',
      title: 'The Little Birdie',
      emoji: '🐦',
      tagline: 'Knows the tea before the kettle is even hot.',
      description: 'Fun fact: the 1 Bamboo isn\'t bamboo at all, it\'s a bird. And honestly? Same energy. You\'re the group chat\'s unofficial news anchor, sending 4-minute voice memos that start with "okay so don\'t be mad." You don\'t gossip, you share updates. Everyone acts annoyed but they\'re refreshing their phone waiting for your next drop.',
      why: [
        'Your screen time report is a cry for help, but the content is elite',
        'You know everyone\'s birthday, ex, and star sign',
        'You can make a new best friend in a bathroom line in under 30 seconds',
      ],
      greenFlag: 'Remembers the tiny thing you mentioned once in March',
      redFlag: '"I won\'t tell anyone" (told 3 people)',
      bestie: 'south-wind',
    },
    {
      id: 'bamboo-9',
      name: '9 Bamboo',
      chinese: '九索',
      title: 'The Type A Icon',
      emoji: '📋',
      tagline: 'Has a Notion template for their Notion templates.',
      description: 'Nine perfectly lined-up sticks? That\'s you before your 7am alarm even goes off. You have a five-year plan, a color-coded calendar, and a backup itinerary for the backup itinerary. Your friends call you "a lot" and then call you first the second anything goes wrong. Chaos fears you.',
      why: [
        'Your Google Calendar is a work of art (and a threat)',
        'You\'ve typed "per my last message" and meant violence',
        'Group trips only happen because of you',
      ],
      greenFlag: 'Shows up 10 minutes early with snacks and a plan',
      redFlag: 'Redoes the whole group project at 2am without telling anyone',
      bestie: 'east-wind',
    },
    {
      id: 'character-1',
      name: '1 Character',
      chinese: '一萬',
      title: 'The Main Character',
      emoji: '👑',
      tagline: 'Walks to the bodega like it\'s the opening scene of a movie.',
      description: 'Number one, baby. One of one. You romanticize your commute, narrate your life in your head, and have a playlist for every mood, including "walking dramatically in the rain." Some call it delusion. You call it manifesting. Either way the camera is always on you, and you are giving the people a show.',
      why: [
        'Your Instagram grid has a cohesive color palette',
        'You\'ve posed for a "candid" at least 40 times',
        'Self-love speedrun, any%',
      ],
      greenFlag: 'Hypes yourself up AND hypes your friends up',
      redFlag: 'Every story somehow ends up being about you',
      bestie: 'red-dragon',
    },
    {
      id: 'character-9',
      name: '9 Character',
      chinese: '九萬',
      title: 'The Big Spender',
      emoji: '🛍️',
      tagline: '"It was on sale." (It was not on sale.)',
      description: '萬 literally means ten thousand, which is roughly how many online shopping tabs you have open right now. You treat yourself, you treat your friends, you treat the barista. Your bank account is in its villain era but your vibes are immaculate. "Life\'s too short" is your entire financial strategy, and honestly it\'s working (emotionally).',
      why: [
        'Your delivery driver knows you by name',
        'You\'ve justified a purchase with "cost per wear"',
        'Picks up the whole bill, then Venmo requests 3 days later',
      ],
      greenFlag: 'Generous with gifts, time, and snacks',
      redFlag: 'Your "little treat" budget has its own zip code',
      bestie: 'green-dragon',
    },
    {
      id: 'dot-1',
      name: '1 Dot',
      chinese: '一筒',
      title: 'The Snack Era',
      emoji: '🥟',
      tagline: 'Round, warm, and thinking about dumplings.',
      description: 'The 1 Dot is basically a giant mooncake, and so are you: soft, comforting, and a little bit sweet. You plan your whole day around meals, your camera roll is 80% food, and you have never once said no to "want to split an appetizer?" People feel at home around you, probably because you always have snacks in your bag.',
      why: [
        'You\'ve ranked every dumpling spot within a 2-mile radius',
        'Your love language is "I saved you the last bite"',
        'You\'re the reason the group always ends up at hot pot',
      ],
      greenFlag: 'Feeds everyone. Literally everyone.',
      redFlag: 'Gets hangry and becomes a completely different person',
      bestie: 'autumn',
    },
    {
      id: 'dot-9',
      name: '9 Dot',
      chinese: '九筒',
      title: 'The Overthinker',
      emoji: '🌀',
      tagline: '47 tabs open in the browser. 47 more in the brain.',
      description: 'Nine dots, nine thoughts per second, zero chill. You\'ve rehearsed a phone call to order pizza. You re-read a text you sent four hours ago looking for "tone." But that big brain also makes you the funniest, most self-aware person in the room. Your 3am thoughts are genuinely elite content.',
      why: [
        'You\'ve typed "haha" and deleted it 6 times',
        'You\'ve made a plan for a scenario with a 0.01% chance of happening',
        'Your Notes app is a museum of unhinged thoughts',
      ],
      greenFlag: 'Notices everything. Thoughtful to the core.',
      redFlag: 'Spirals for a full day if someone texts "can we talk?"',
      bestie: 'chrysanthemum',
    },
    {
      id: 'green-dragon',
      name: 'Green Dragon',
      chinese: '發',
      title: 'The Hustler',
      emoji: '💸',
      tagline: '發 means "get rich." You took that personally.',
      description: '發 (fa) literally means prosperity, and you\'ve had a side hustle since your 3rd grade lemonade stand. A resale business, an Etsy shop, a "personal brand": you\'ve tried them all and somehow turned a profit. You manifest, you grind, you say "it\'s giving abundance." The Lucky Cat approves of your energy.',
      why: [
        'You\'ve said "let\'s circle back" in a casual conversation',
        'Your LinkedIn has more posts than your Instagram',
        'Low-key the luckiest person anyone knows',
      ],
      greenFlag: 'Ambitious, and makes it look fun',
      redFlag: 'Turns a friend\'s birthday dinner into a networking event',
      bestie: 'character-9',
    },
    {
      id: 'red-dragon',
      name: 'Red Dragon',
      chinese: '中',
      title: 'The It Girl',
      emoji: '🔥',
      tagline: 'Center of attention? It\'s literally in the name.',
      description: '中 means "center" and "hitting the target." You walk into a room and it rearranges itself around you. Confident, competitive, and slightly dangerous at game night, you don\'t play to participate. You play to win, and then you post about it. People say you\'re intimidating; you prefer the word "iconic."',
      why: [
        'You\'ve won an argument you were wrong in',
        'Your "just threw this on" fit took 45 minutes',
        'Board game night ends friendships when you\'re there',
      ],
      greenFlag: 'Defends your friends like it\'s an Olympic sport',
      redFlag: 'Ultra competitive. Even at Uno. Especially at Uno.',
      bestie: 'character-1',
    },
    {
      id: 'white-dragon',
      name: 'White Dragon',
      chinese: '白板',
      title: 'The Clean Girl Aesthetic',
      emoji: '🤍',
      tagline: 'Quiet luxury. Loud standards.',
      description: 'The White Dragon is a clean blue frame and absolutely nothing else: the original minimalist. Your apartment is beige, your wardrobe is a capsule, and your skincare routine has 9 steps so your makeup can look like zero. You\'re calm, curated, and a little mysterious. Nobody knows what you\'re thinking, and you like it that way.',
      why: [
        'You own at least 3 of the exact same white tee',
        'Zero unread notifications (psychopath behavior)',
        'You\'ve said "less is more" and actually meant it',
      ],
      greenFlag: 'Keeps the peace and the countertops clean',
      redFlag: 'Silently judges anyone who leaves dishes in the sink',
      bestie: 'north-wind',
    },
    {
      id: 'east-wind',
      name: 'East Wind',
      chinese: '東',
      title: 'The Group Chat CEO',
      emoji: '🌅',
      tagline: 'The sun rises in the east. So do you, at 6am, unprompted.',
      description: 'East Wind always goes first: the dealer, the leader, the one who rises with the sun. You\'re the friend who says "okay so who\'s booking?" and then books it. You make the plans, send the calendar invite, and remember who\'s vegetarian. Without you, the group chat is just 12 people saying "I\'m down" and nobody doing anything.',
      why: [
        'You\'ve made a group poll for a casual dinner',
        'You wake up before your alarm and you\'re annoyingly happy about it',
        'Natural-born leader with an unnatural amount of energy',
      ],
      greenFlag: 'Makes things actually happen',
      redFlag: 'Takes it personally when people don\'t vote in the poll',
      bestie: 'bamboo-9',
    },
    {
      id: 'south-wind',
      name: 'South Wind',
      chinese: '南',
      title: 'The Golden Retriever',
      emoji: '🐶',
      tagline: 'Warm breeze, warm heart, zero thoughts, all vibes.',
      description: 'South Wind brings the warm weather, and you bring warm energy everywhere you go. You\'re the hype person, the "OMG YOU LOOK SO GOOD" commenter, the friend who greets everyone like it\'s been years (it\'s been 2 days). You could make friends with a wall, and the wall would walk away happier.',
      why: [
        'You hug people you met 5 minutes ago',
        'You\'ve cried at a dog video this week',
        'Your enthusiasm could power a small city',
      ],
      greenFlag: 'Everyone\'s biggest fan, no conditions',
      redFlag: 'Cannot lie. Your face gives it away instantly.',
      bestie: 'bamboo-1',
    },
    {
      id: 'west-wind',
      name: 'West Wind',
      chinese: '西',
      title: 'The Sunset Romantic',
      emoji: '🌇',
      tagline: 'Golden hour is a personality, and you have it.',
      description: 'The sun sets in the west and so does your heart, every single evening. You romanticize everything: your coffee, your commute, a mildly nice cloud. You\'ve written a poem in your Notes app about a stranger on the subway. You\'re a hopeless romantic, and honestly? It\'s working. Life looks better through your filter.',
      why: [
        'You\'ve stopped mid-sentence to photograph the sky',
        'Your Spotify Wrapped is just yearning',
        'You still have a playlist for someone from 2019',
      ],
      greenFlag: 'Makes ordinary days feel like a movie',
      redFlag: 'Falls in love with anyone who holds a door open',
      bestie: 'orchid',
    },
    {
      id: 'north-wind',
      name: 'North Wind',
      chinese: '北',
      title: 'The Cool Introvert',
      emoji: '🎧',
      tagline: 'Cold exterior. Warm interior. Do not perceive me.',
      description: 'North Wind is chilly, mysterious, and comes from somewhere far away. People think you\'re aloof, but really your social battery is at 2%. You have three close friends, noise-canceling headphones that never come off, and a dry sense of humor that absolutely destroys. Once someone gets in, they\'re lucky for life.',
      why: [
        'You\'ve pretended not to see someone you know in public',
        'Your social battery has a 2-hour lifespan',
        'Deadpan humor that sneaks up on people',
      ],
      greenFlag: 'Loyal to the end (to a very select few)',
      redFlag: 'Irish exits every single party',
      bestie: 'white-dragon',
    },
    {
      id: 'spring',
      name: 'Spring',
      chinese: '春',
      title: 'The Fresh Start',
      emoji: '🌸',
      tagline: 'New hobby, new me. (Again.)',
      description: 'Spring is all about new beginnings, and you\'ve had about 47 of them this year. Pottery, run club, sourdough, crochet, learning mahjong (great choice, by the way). You\'re optimistic, curious, and always blooming into something new. Your closet is full of hobby gear, but your heart is full of joy, and that\'s what counts.',
      why: [
        'You\'ve bought all the gear for a hobby you tried once',
        'Your "new era" announcements are a monthly event',
        'Eternal optimist: the glass is half full and also sparkling',
      ],
      greenFlag: 'Brings fresh energy into every room',
      redFlag: 'Your hobbies have a two-week half-life',
      bestie: 'summer',
    },
    {
      id: 'summer',
      name: 'Summer',
      chinese: '夏',
      title: 'Out of Office',
      emoji: '😎',
      tagline: 'Hot tile summer, all year round.',
      description: 'Summer is the season of "say yes to everything," and you live there year-round. Beach day? Yes. Spontaneous road trip? Already packed. Rooftop at 11pm on a Tuesday? Obviously. You have a tan line in November and a camera roll full of sunsets. You\'ve never experienced FOMO, because you are always there.',
      why: [
        'You\'ve booked a flight on a whim',
        'Your camera roll is 90% sunsets and spritzes',
        'You have never once left a party early',
      ],
      greenFlag: 'The most fun person in any room',
      redFlag: 'Replies to texts from a different time zone',
      bestie: 'spring',
    },
    {
      id: 'autumn',
      name: 'Autumn',
      chinese: '秋',
      title: 'The Cozy Era',
      emoji: '🍂',
      tagline: 'Oversized sweater, warm drink, candle lit. Always.',
      description: 'Autumn is your whole aesthetic: chunky knits, journaling at a café, a candle named something like "Cashmere Woods" burning at all times. You\'re soft, sentimental, and the friend who says "let\'s just stay in and do a puzzle." It\'s giving cottagecore with Wi-Fi, and you are so comforting to be around.',
      why: [
        'You own more blankets than plates',
        'You start decorating for fall in August',
        'You\'ve rewatched your comfort show more than five times',
      ],
      greenFlag: 'Makes everyone feel safe and cozy',
      redFlag: 'Will not leave the house if it\'s under 60°F',
      bestie: 'dot-1',
    },
    {
      id: 'winter',
      name: 'Winter',
      chinese: '冬',
      title: 'The Hibernator',
      emoji: '😴',
      tagline: 'Canceled plans are my love language.',
      description: 'Winter is here, and so are your blankets. You are a professional homebody, a certified blanket burrito, and a world-class napper. When plans get canceled you feel a joy so pure it should be illegal. But when you do show up? Everyone\'s thrilled, because you\'re cozy, chill, and you bring the best snacks to hot pot.',
      why: [
        'Your bed is your office, dining room, and therapist',
        'You\'ve said "on my way!" while still in pajamas',
        'Peak performance hours: 11pm to 3am',
      ],
      greenFlag: 'Zero drama, ultra low-maintenance friend',
      redFlag: 'Do Not Disturb has been on since 2022',
      bestie: 'chrysanthemum',
    },
    {
      id: 'plum',
      name: 'Plum Blossom',
      chinese: '梅',
      title: 'The Comeback Kid',
      emoji: '🌺',
      tagline: 'Blooms in the snow. Unbothered. Moisturized.',
      description: 'The plum blossom is the first flower to bloom in the dead of winter, and that\'s you: you\'ve been through it and came out glowing. You\'re the friend everyone calls in a crisis, the group\'s unpaid therapist, and somehow still smiling. You don\'t just bounce back. You bounce back with a new haircut.',
      why: [
        'You\'ve given life-changing advice while your own life was on fire',
        'Your glow-up arc is legendary',
        'Rejection? Redirection, bestie',
      ],
      greenFlag: 'Strong, steady, and always there for people',
      redFlag: 'Says "I\'m fine" while clearly in a season finale',
      bestie: 'bamboo-flower',
    },
    {
      id: 'orchid',
      name: 'Orchid',
      chinese: '蘭',
      title: 'The Elegant One',
      emoji: '🪷',
      tagline: 'Not high maintenance. Highly curated.',
      description: 'Orchids are graceful, refined, and need very specific conditions to thrive. Sounds about right. You have taste: in music, in food, in restaurants nobody has heard of yet. You\'re a plant parent, a matcha connoisseur, and you somehow always smell amazing. People think you\'re fancy. You are. You\'ve earned it.',
      why: [
        'You have opinions about the water temperature for tea',
        'Your plants have names and birthdays',
        'You\'ve said "it\'s giving" about wallpaper',
      ],
      greenFlag: 'Elevates every hangout with impeccable taste',
      redFlag: 'Won\'t eat anywhere under 4.5 stars',
      bestie: 'west-wind',
    },
    {
      id: 'chrysanthemum',
      name: 'Chrysanthemum',
      chinese: '菊',
      title: 'The Old Soul',
      emoji: '🍵',
      tagline: '24 going on 84.',
      description: 'Chrysanthemums stand for long life, and you\'ve basically lived several already. You love tea, crosswords, gardening, and being in bed by 9:30pm. You give advice like the wise grandma in a kung fu movie, and nobody knows how you know so much. You\'re calm, wise, and frankly the reason your friend group hasn\'t fallen apart.',
      why: [
        'You\'ve said "kids these days" unironically',
        'You own a cardigan for every occasion',
        'Your idea of a wild night is a new 1,000-piece puzzle',
      ],
      greenFlag: 'Wise beyond your years and great at advice',
      redFlag: 'Goes to bed before the party even starts',
      bestie: 'dot-9',
    },
    {
      id: 'bamboo-flower',
      name: 'Bamboo',
      chinese: '竹',
      title: 'The Go-With-The-Flow',
      emoji: '🐼',
      tagline: 'Bends, never breaks. Also low-key a panda.',
      description: 'Bamboo sways in the wind and never snaps, and you\'re just as chill. Plans changed? Cool. Two-hour wait at the restaurant? We\'ll find another one. You\'re adaptable, easygoing, and the most peaceful presence in any group. Pandas would trust you. Your friends definitely do.',
      why: [
        'Your answer to "where do you want to eat?" is a genuine "anything!"',
        'You have never once stressed about running late',
        'You grow on people fast (like, actual bamboo fast)',
      ],
      greenFlag: 'Unshakeable calm in any storm',
      redFlag: 'Cannot make a decision to save your life',
      bestie: 'plum',
    },
    {
      id: 'blank',
      name: 'Blank Tile',
      chinese: '空白',
      title: 'The Spare',
      emoji: '🫥',
      tagline: 'Wasn\'t supposed to be in the box. Showed up anyway.',
      description: 'Plot twist: you\'re the blank tile. The spare. The "wait, what\'s this one for?" Grandma uses you to replace the tile she lost in 1997. You have no suit, no number, no rules, and you are thriving. You\'re unpredictable, unbothered, and a total wildcard. Nobody knows what you\'ll do next, including you.',
      why: [
        'You\'ve shown up to a party without knowing whose party it was',
        'Your vibe is "loading…" and somehow it works',
        'You can literally be anything. True wildcard energy.',
      ],
      greenFlag: 'Fits in anywhere, gets along with everyone',
      redFlag: 'Your five-year plan is a shrug emoji',
      bestie: 'dot-9',
    },
  ];

  var QUESTIONS = [
    {
      text: 'It\'s Friday night. Where are you?',
      options: [
        { emoji: '📊', text: 'Organizing dinner for 8 (I made a group poll)', tiles: ['east-wind', 'bamboo-9', 'south-wind'] },
        { emoji: '🪩', text: 'Out until sunrise. No plans, all vibes.', tiles: ['summer', 'red-dragon', 'character-9'] },
        { emoji: '🛋️', text: 'Blanket burrito. Phone at 3%. Do not perceive me.', tiles: ['winter', 'dot-1'] },
        { emoji: '🏺', text: 'At the pottery class I found on TikTok yesterday', tiles: ['spring', 'orchid', 'chrysanthemum'] },
      ],
    },
    {
      text: 'What\'s your role in the group chat?',
      options: [
        { emoji: '🎙️', text: 'The yapper. Voice memos and breaking news.', tiles: ['bamboo-1', 'south-wind', 'character-1'] },
        { emoji: '👍', text: 'Leaves it on read, thumbs-ups it 3 days later', tiles: ['north-wind', 'winter'] },
        { emoji: '🗂️', text: 'Drops the Google Doc itinerary', tiles: ['bamboo-9', 'east-wind', 'white-dragon'] },
        { emoji: '🐸', text: 'Sends memes at 3am that nobody asked for', tiles: ['dot-9', 'summer'] },
      ],
    },
    {
      text: 'Pick your drink order:',
      options: [
        { emoji: '☕', text: 'Iced oat latte, extra shot. I\'m busy.', tiles: ['character-1', 'bamboo-9', 'green-dragon'] },
        { emoji: '🧋', text: 'Brown sugar boba, 100% sweet', tiles: ['dot-1', 'autumn', 'winter'] },
        { emoji: '🍵', text: 'Loose-leaf tea, brewed at exactly 80°C', tiles: ['chrysanthemum', 'plum', 'orchid'] },
        { emoji: '💧', text: 'Water. Room temperature.', tiles: ['white-dragon', 'blank'] },
      ],
    },
    {
      text: 'Your relationship with money is…',
      options: [
        { emoji: '📈', text: '3 side hustles and a high-yield savings account', tiles: ['green-dragon', 'bamboo-9', 'east-wind'] },
        { emoji: '🕯️', text: '"It\'s an investment." (It\'s a $90 candle.)', tiles: ['character-9', 'orchid'] },
        { emoji: '🍜', text: 'Spent it all on food. No regrets.', tiles: ['dot-1', 'summer'] },
        { emoji: '✨', text: 'What money? I run on vibes.', tiles: ['blank', 'spring', 'bamboo-flower'] },
      ],
    },
    {
      text: 'Be honest. Your toxic trait is…',
      options: [
        { emoji: '📱', text: 'Overthinking a text for 45 minutes', tiles: ['dot-9', 'west-wind'] },
        { emoji: '🏆', text: 'Turning everything into a competition', tiles: ['red-dragon', 'green-dragon', 'east-wind'] },
        { emoji: '🎬', text: 'Main-charactering on the subway with headphones in', tiles: ['character-1', 'west-wind', 'summer'] },
        { emoji: '🙅', text: 'Canceling plans and feeling zero guilt', tiles: ['winter', 'north-wind'] },
      ],
    },
    {
      text: 'Pick a season to live in forever:',
      options: [
        { emoji: '🌸', text: 'Cherry blossoms and fresh starts', tiles: ['spring', 'plum', 'bamboo-1', 'east-wind'] },
        { emoji: '🏖️', text: 'Beach days and sunburns', tiles: ['summer', 'south-wind'] },
        { emoji: '🍂', text: 'Sweater weather and journaling', tiles: ['autumn', 'west-wind', 'chrysanthemum'] },
        { emoji: '❄️', text: 'Snow days and hot pot', tiles: ['winter', 'north-wind', 'plum', 'dot-1'] },
      ],
    },
    {
      text: 'Your friends would describe you as…',
      options: [
        { emoji: '🐕', text: 'A golden retriever in human form', tiles: ['south-wind', 'bamboo-1', 'spring'] },
        { emoji: '🧊', text: 'Intimidating… until they get to know you', tiles: ['north-wind', 'red-dragon', 'white-dragon'] },
        { emoji: '🫶', text: 'The mom friend / unpaid therapist', tiles: ['plum', 'bamboo-flower', 'chrysanthemum'] },
        { emoji: '🌪️', text: 'Chaotic, but lovable', tiles: ['dot-9', 'blank', 'character-9'] },
      ],
    },
    {
      text: 'At the mahjong table, you\'re…',
      options: [
        { emoji: '🐉', text: 'Going for the biggest, flashiest hand every time', tiles: ['character-9', 'red-dragon', 'character-1'] },
        { emoji: '🧮', text: 'Counting every tile like a human spreadsheet', tiles: ['bamboo-9', 'dot-9', 'green-dragon'] },
        { emoji: '🥟', text: 'Mostly here for the snacks and the gossip', tiles: ['dot-1', 'bamboo-1', 'autumn'] },
        { emoji: '🍀', text: 'Somehow winning without knowing the rules', tiles: ['blank', 'bamboo-flower', 'spring'] },
      ],
    },
    {
      text: 'What\'s on your phone lock screen?',
      options: [
        { emoji: '🤳', text: 'A group selfie where I look the best', tiles: ['character-1', 'red-dragon', 'bamboo-1'] },
        { emoji: '🌇', text: 'A sunset I took 4 years ago', tiles: ['west-wind', 'autumn'] },
        { emoji: '📵', text: 'The default one. Too many choices, so I never changed it.', tiles: ['blank', 'white-dragon', 'dot-9'] },
        { emoji: '🪴', text: 'My pet. Or my plant. Same thing.', tiles: ['orchid', 'bamboo-flower', 'south-wind'] },
      ],
    },
    {
      text: 'Pick a life motto:',
      options: [
        { emoji: '🎋', text: '"Bend, don\'t break."', tiles: ['bamboo-flower', 'plum'] },
        { emoji: '💰', text: '"Secure the bag."', tiles: ['green-dragon', 'character-9'] },
        { emoji: '🤍', text: '"Less is more."', tiles: ['white-dragon', 'north-wind', 'chrysanthemum'] },
        { emoji: '🎞️', text: '"Romanticize everything."', tiles: ['west-wind', 'autumn', 'orchid'] },
      ],
    },
  ];

  var TILE_MAP = {};
  TILES.forEach(function (t) { TILE_MAP[t.id] = t; });

  function getTile(id) {
    return TILE_MAP[id] || null;
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  // answers: one option index per question. Ties are broken by a hash of the answers, so the same
  // answers always give the same tile without favoring tiles from any particular question.
  function scoreAnswers(answers) {
    var scores = {};
    answers.forEach(function (optionIndex, q) {
      var option = QUESTIONS[q] && QUESTIONS[q].options[optionIndex];
      if (!option) return;
      option.tiles.forEach(function (id) {
        scores[id] = (scores[id] || 0) + 1;
      });
    });
    var key = answers.join('');
    var best = null;
    Object.keys(scores).forEach(function (id) {
      if (!best || scores[id] > scores[best] ||
          (scores[id] === scores[best] && hash(key + id) > hash(key + best))) {
        best = id;
      }
    });
    return best;
  }

  function shareUrl(base, id) {
    return base.split('?')[0].split('#')[0] + '?tile=' + encodeURIComponent(id);
  }

  function normalizeInstagram(value) {
    var handle = String(value || '').trim()
      .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
      .replace(/[/?#].*$/, '')
      .replace(/^@+/, '');
    return handle ? '@' + handle : '';
  }

  function isValidZip(value) {
    return /^\d{5}(-\d{4})?$/.test(String(value || '').trim());
  }

  function validateProfile(profile) {
    var errors = {};
    if (!String(profile.name || '').trim()) errors.name = 'Tell us what to call you';
    if (!/^@[A-Za-z0-9._]{1,30}$/.test(normalizeInstagram(profile.instagram))) errors.instagram = 'Enter your Instagram handle, like @luckycat.mahjong';
    if (!isValidZip(profile.zip)) errors.zip = 'Enter a 5-digit zip code';
    if (SKILL_LEVELS.indexOf(profile.skill) === -1) errors.skill = 'Pick your skill level';
    return errors;
  }

  function buildFormBody(profile, tile) {
    var params = [
      [FORM_FIELDS.name, String(profile.name).trim()],
      [FORM_FIELDS.instagram, normalizeInstagram(profile.instagram)],
      [FORM_FIELDS.zip, String(profile.zip).trim()],
      [FORM_FIELDS.skill, profile.skill],
    ];
    if (tile) params.push([FORM_FIELDS.result, tile.name]);
    return params.map(function (p) {
      return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]);
    }).join('&');
  }

  // ---- Browser UI ----

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function track(name, params) {
    if (typeof root.gtag === 'function') root.gtag('event', name, params || {});
  }

  function loadState() {
    try {
      return JSON.parse(root.localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveState(state) {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable (private mode) */ }
  }

  function art(id, opts) {
    return root.LuckyCatTileArt ? root.LuckyCatTileArt.render(id, opts) : '';
  }

  function submitToForm(profile, tile) {
    var request = fetch(FORM_ACTION, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildFormBody(profile, tile),
    });
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, 10000);
    });
    return Promise.race([request, timeout]);
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function createApp(doc) {
    var $ = function (sel) { return doc.querySelector(sel); };
    var screens = ['intro', 'question', 'info', 'loading', 'result'];
    var state = loadState();
    var answers = [];
    var current = 0;
    var resultTile = null;

    function show(name) {
      screens.forEach(function (s) {
        var el = $('#tq-' + s);
        if (el) el.hidden = s !== name;
      });
      var main = $('#tq-main');
      if (main) main.setAttribute('data-screen', name);
      root.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function setUrlTile(id) {
      if (!root.history || !root.history.replaceState) return;
      var url = id ? shareUrl(root.location.href, id) : root.location.pathname;
      root.history.replaceState(null, '', url);
    }

    function renderIntro() {
      var parade = ['character-1', 'red-dragon', 'spring', 'bamboo-1', 'blank'];
      $('#tq-parade').innerHTML = parade.map(function (id, i) {
        return '<div class="tq-parade-tile" style="--i:' + i + '">' + art(id) + '</div>';
      }).join('');

      var note = $('#tq-returning');
      var mine = state.tile && getTile(state.tile);
      if (mine) {
        note.innerHTML = 'Last time you were the <a href="' + escapeHtml(shareUrl(root.location.href, mine.id)) + '">' +
          escapeHtml(mine.name) + '</a>. Let\'s see if that\'s still true.';
        note.hidden = false;
      } else {
        note.hidden = true;
      }
    }

    function renderQuestion() {
      var q = QUESTIONS[current];
      $('#tq-progress-label').textContent = 'Question ' + (current + 1) + ' of ' + QUESTIONS.length;
      $('#tq-progress-bar').style.width = ((current) / QUESTIONS.length * 100) + '%';
      $('#tq-question-text').textContent = q.text;
      $('#tq-options').innerHTML = q.options.map(function (opt, i) {
        var selected = answers[current] === i ? ' is-selected' : '';
        return '<button type="button" class="tq-option' + selected + '" data-index="' + i + '">' +
          '<span class="tq-option-emoji" aria-hidden="true">' + opt.emoji + '</span>' +
          '<span class="tq-option-text">' + escapeHtml(opt.text) + '</span></button>';
      }).join('');
      var focusTarget = $('#tq-question-text');
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }

    function startQuiz() {
      answers = [];
      current = 0;
      resultTile = null;
      setUrlTile(null);
      track('tile_quiz_start');
      renderQuestion();
      show('question');
    }

    function choose(index) {
      answers[current] = index;
      var buttons = doc.querySelectorAll('.tq-option');
      buttons.forEach(function (b) { b.classList.toggle('is-selected', Number(b.dataset.index) === index); });
      setTimeout(function () {
        if (current < QUESTIONS.length - 1) {
          current += 1;
          renderQuestion();
        } else {
          finishQuiz();
        }
      }, 220);
    }

    function goBack() {
      if (current === 0) {
        show('intro');
        return;
      }
      current -= 1;
      renderQuestion();
    }

    function finishQuiz() {
      $('#tq-progress-bar').style.width = '100%';
      resultTile = getTile(scoreAnswers(answers));
      track('tile_quiz_complete', { tile: resultTile.id });

      if (state.submitted) {
        reveal(Promise.resolve());
        return;
      }
      prefillInfo();
      show('info');
    }

    function prefillInfo() {
      var p = state.profile || {};
      var form = $('#tq-info-form');
      form.elements.name.value = p.name || '';
      form.elements.instagram.value = p.instagram || '';
      form.elements.zip.value = p.zip || '';
      Array.prototype.forEach.call(form.elements.skill, function (r) { r.checked = r.value === p.skill; });
      clearErrors();
    }

    function clearErrors() {
      doc.querySelectorAll('.tq-field-error').forEach(function (el) { el.textContent = ''; });
      doc.querySelectorAll('.tq-field.has-error').forEach(function (el) { el.classList.remove('has-error'); });
    }

    function readProfile() {
      var form = $('#tq-info-form');
      var skill = '';
      Array.prototype.forEach.call(form.elements.skill, function (r) { if (r.checked) skill = r.value; });
      return {
        name: form.elements.name.value.trim(),
        instagram: form.elements.instagram.value.trim(),
        zip: form.elements.zip.value.trim(),
        skill: skill,
      };
    }

    function onInfoSubmit(e) {
      e.preventDefault();
      clearErrors();
      var profile = readProfile();
      var errors = validateProfile(profile);
      var keys = Object.keys(errors);
      if (keys.length) {
        keys.forEach(function (k) {
          var field = doc.querySelector('[data-field="' + k + '"]');
          if (!field) return;
          field.classList.add('has-error');
          field.querySelector('.tq-field-error').textContent = errors[k];
        });
        var first = doc.querySelector('[data-field="' + keys[0] + '"] input');
        if (first) first.focus();
        return;
      }

      profile.instagram = normalizeInstagram(profile.instagram);
      state.profile = profile;
      saveState(state);

      var tile = resultTile;
      var submission = submitToForm(profile, tile).then(function () {
        state.submitted = true;
        state.submittedAt = new Date().toISOString();
        state.submittedTile = tile.id;
        saveState(state);
        track('tile_quiz_submit', { tile: tile.id, skill_level: profile.skill });
      }).catch(function () { /* show the result anyway; we'll retry on the next attempt */ });

      reveal(submission);
    }

    function reveal(pending) {
      show('loading');
      Promise.all([pending, wait(1600)]).then(function () {
        state.tile = resultTile.id;
        saveState(state);
        setUrlTile(resultTile.id);
        renderResult(resultTile, true);
        show('result');
      });
    }

    function renderResult(tile, isMine) {
      var color = root.LuckyCatTileArt ? root.LuckyCatTileArt.colorFor(tile.id) : '#C41E3A';
      var card = $('#tq-result');
      card.style.setProperty('--tile-color', color);

      var name = isMine && state.profile && state.profile.name ? state.profile.name.split(' ')[0] : '';
      $('#tq-result-kicker').textContent = isMine ? (name ? name + ', you\'re the' : 'You\'re the') : 'Meet the';
      $('#tq-result-art').innerHTML = art(tile.id, { label: tile.name + ' chibi mahjong tile', className: 'tile-art tq-result-svg' });
      $('#tq-result-name').innerHTML = escapeHtml(tile.name) + ' <span class="tq-result-chinese" lang="zh-Hant">' + escapeHtml(tile.chinese) + '</span>';
      $('#tq-result-title').textContent = tile.emoji + ' ' + tile.title;
      $('#tq-result-tagline').textContent = tile.tagline;
      $('#tq-result-description').textContent = tile.description;
      $('#tq-result-why').innerHTML = tile.why.map(function (w) { return '<li>' + escapeHtml(w) + '</li>'; }).join('');
      $('#tq-result-green').textContent = tile.greenFlag;
      $('#tq-result-red').textContent = tile.redFlag;

      var bestie = getTile(tile.bestie);
      $('#tq-result-bestie').innerHTML = bestie ? (
        '<a class="tq-bestie-link" href="' + escapeHtml(shareUrl(root.location.href, bestie.id)) + '">' +
          '<span class="tq-bestie-art">' + art(bestie.id) + '</span>' +
          '<span><strong>' + escapeHtml(bestie.name) + '</strong><br><span class="tq-muted">' + escapeHtml(bestie.title) + '</span></span>' +
        '</a>'
      ) : '';

      $('#tq-retake').textContent = isMine ? 'Retake the quiz' : 'Which tile are you? Take the quiz';
      $('#tq-retake').classList.toggle('btn-primary', !isMine);
      $('#tq-retake').classList.toggle('btn-outline', isMine);
      $('#tq-share-heading').textContent = isMine ? 'Share your tile' : 'Send this to the friend who\'s a ' + tile.name;
      card.setAttribute('data-mine', isMine ? 'true' : 'false');
      resultTile = tile;
      renderGallery(tile.id);
    }

    function renderGallery(activeId) {
      var grid = $('#tq-gallery-grid');
      if (!grid) return;
      grid.innerHTML = TILES.map(function (t) {
        var active = t.id === activeId ? ' is-active' : '';
        return '<li><a class="tq-gallery-item' + active + '" href="' + escapeHtml(shareUrl(root.location.href, t.id)) + '">' +
          '<span class="tq-gallery-art">' + art(t.id) + '</span>' +
          '<span class="tq-gallery-name">' + escapeHtml(t.name) + '</span>' +
          '<span class="tq-gallery-title">' + escapeHtml(t.title) + '</span></a></li>';
      }).join('');
    }

    function shareText(tile, isMine) {
      return (isMine ? 'I\'m the ' : 'You\'re giving ') + tile.name + ' ' + tile.chinese + ': ' + tile.title + ' ' + tile.emoji +
        '\nWhich mahjong tile are you?';
    }

    function currentShareUrl() {
      var base = /^https?:/.test(root.location.protocol) ? root.location.href : SITE_URL;
      return shareUrl(base, resultTile.id);
    }

    function toast(message) {
      var el = $('#tq-toast');
      el.textContent = message;
      el.classList.add('is-visible');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(function () { el.classList.remove('is-visible'); }, 2400);
    }

    function copyLink() {
      var url = currentShareUrl();
      var done = function () { toast('Link copied! Go spread the tile tea 🫖'); };
      if (root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(url).then(done, function () { root.prompt('Copy this link:', url); });
      } else {
        root.prompt('Copy this link:', url);
      }
      track('tile_quiz_share', { method: 'copy_link', tile: resultTile.id });
    }

    function shareLink() {
      var isMine = $('#tq-result').getAttribute('data-mine') === 'true';
      if (root.navigator.share) {
        root.navigator.share({ title: 'Which Mahjong Tile Are You?', text: shareText(resultTile, isMine), url: currentShareUrl() })
          .then(function () { track('tile_quiz_share', { method: 'native', tile: resultTile.id }); })
          .catch(function () {});
      } else {
        copyLink();
      }
    }

    function wrapLines(ctx, text, maxWidth) {
      var words = text.split(' ');
      var lines = [];
      var line = '';
      words.forEach(function (w) {
        var test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      });
      if (line) lines.push(line);
      return lines;
    }

    function buildShareImage(tile) {
      var W = 1080;
      var H = 1350;
      var color = root.LuckyCatTileArt.colorFor(tile.id);
      var canvas = doc.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');
      var heading = '"KN Yuanmo SC", "PingFang SC", sans-serif';
      var body = '"Avenir Next", Avenir, -apple-system, "Segoe UI", sans-serif';

      ctx.fillStyle = '#FFF8F0';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(W / 2, 580, 420, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, 18);
      ctx.fillRect(0, H - 18, W, 18);

      var svg = root.LuckyCatTileArt.render(tile.id, { width: 480 });
      var img = new Image();
      var fontsReady = doc.fonts && doc.fonts.load ? doc.fonts.load('64px "KN Yuanmo SC"').catch(function () {}) : Promise.resolve();

      return fontsReady.then(function () {
        return new Promise(function (resolve, reject) {
          img.onload = resolve;
          img.onerror = reject;
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        });
      }).then(function () {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5C5C5C';
        ctx.font = '600 44px ' + body;
        ctx.fillText('I\'m the', W / 2, 120);
        ctx.fillStyle = '#C41E3A';
        ctx.font = '96px ' + heading;
        ctx.fillText(tile.name + ' ' + tile.chinese, W / 2, 222);

        ctx.drawImage(img, W / 2 - 240, 262, 480, 600);

        ctx.fillStyle = '#1A1A1A';
        ctx.font = '64px ' + heading;
        ctx.fillText(tile.title, W / 2, 940);

        ctx.fillStyle = '#5C5C5C';
        ctx.font = '600 40px ' + body;
        wrapLines(ctx, tile.tagline, 880).slice(0, 3).forEach(function (line, i) {
          ctx.fillText(line, W / 2, 1012 + i * 54);
        });

        ctx.fillStyle = color;
        ctx.font = '48px ' + heading;
        ctx.fillText('Which mahjong tile are you?', W / 2, 1200);
        ctx.fillStyle = '#5C5C5C';
        ctx.font = '600 34px ' + body;
        ctx.fillText('luckycatmahjong.com 🐱', W / 2, 1260);

        return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      });
    }

    function saveImage() {
      var tile = resultTile;
      var button = $('#tq-save-image');
      button.disabled = true;
      buildShareImage(tile).then(function (blob) {
        var filename = 'i-am-the-' + tile.id + '-mahjong-tile.png';
        var file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
        if (file && root.navigator.canShare && root.navigator.canShare({ files: [file] })) {
          return root.navigator.share({ files: [file], title: tile.name, text: shareText(tile, true) + '\n' + currentShareUrl() })
            .catch(function () {});
        }
        var a = doc.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        doc.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast('Saved! Perfect for your story 📸');
      }).catch(function () {
        toast('Couldn\'t make the image. Try a screenshot instead!');
      }).then(function () {
        button.disabled = false;
        track('tile_quiz_share', { method: 'image', tile: tile.id });
      });
    }

    function bind() {
      $('#tq-start').addEventListener('click', startQuiz);
      $('#tq-back').addEventListener('click', goBack);
      $('#tq-options').addEventListener('click', function (e) {
        var btn = e.target.closest('.tq-option');
        if (btn) choose(Number(btn.dataset.index));
      });
      $('#tq-info-form').addEventListener('submit', onInfoSubmit);
      $('#tq-info-back').addEventListener('click', function () {
        current = QUESTIONS.length - 1;
        renderQuestion();
        show('question');
      });
      $('#tq-retake').addEventListener('click', startQuiz);
      $('#tq-hero-cta').addEventListener('click', startQuiz);
      $('#tq-share').addEventListener('click', shareLink);
      $('#tq-copy').addEventListener('click', copyLink);
      $('#tq-save-image').addEventListener('click', saveImage);
    }

    function init() {
      bind();
      renderIntro();
      var params = new URLSearchParams(root.location.search);
      var shared = getTile(params.get('tile'));
      if (shared) {
        renderResult(shared, shared.id === state.tile);
        show('result');
        track('tile_quiz_view_shared', { tile: shared.id });
      } else {
        renderGallery(null);
        show('intro');
      }
    }

    return { init: init };
  }

  var api = {
    TILES: TILES,
    QUESTIONS: QUESTIONS,
    FORM_FIELDS: FORM_FIELDS,
    SKILL_LEVELS: SKILL_LEVELS,
    getTile: getTile,
    scoreAnswers: scoreAnswers,
    shareUrl: shareUrl,
    normalizeInstagram: normalizeInstagram,
    isValidZip: isValidZip,
    validateProfile: validateProfile,
    buildFormBody: buildFormBody,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LuckyCatTileQuiz = api;
    var start = function () { createApp(document).init(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
