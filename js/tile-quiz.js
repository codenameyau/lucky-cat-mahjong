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
      id: 'one-bamboo',
      name: '1 Bamboo',
      chinese: '一索',
      title: 'The Little Birdie',
      emoji: '🐦',
      tagline: 'Knows the tea before it\'s even been poured.',
      description: 'Fun fact: the 1 Bamboo is a bird, and players literally nickname it 幺雞, "little chicken." Same energy. You\'re the group chat\'s unofficial news anchor, dropping 4-minute voice memos that start with "okay, don\'t be mad." You don\'t gossip, you share updates. Everyone acts annoyed, but they\'re refreshing their phone waiting for your next drop.',
      why: [
        'Your screen time report is a cry for help, but the content is elite',
        'You know everyone\'s birthday, ex, and MBTI',
        'You heard about your cousin\'s engagement before your mom did',
      ],
      greenFlag: 'Remembers the tiny thing you said once in March',
      redFlag: '"I won\'t tell anyone" (told the whole family group chat)',
      bestie: 'south-wind',
      enemy: 'north-wind',
    },
    {
      id: 'nine-bamboo',
      name: '9 Bamboo',
      chinese: '九索',
      title: 'The Type A Icon',
      emoji: '📋',
      tagline: 'Has a Notion template for their Notion templates.',
      description: 'Nine sticks, perfectly lined up? That\'s you before your 7am alarm. Five-year plan, color-coded calendar, and a backup itinerary for the backup itinerary. You\'ve Venmo-requested a friend for $3.47 and itemized the tip. People call you "a lot," then call you first the second anything goes wrong. Chaos fears you.',
      why: [
        'Your Google Calendar is a work of art (and a threat)',
        'You\'ve typed "per my last email" and meant violence',
        'Low-key your parents\' favorite. They\'ll never say it out loud.',
      ],
      greenFlag: 'Shows up 10 minutes early with snacks and a plan',
      redFlag: 'Splits the hot pot bill down to who ate the extra fish balls',
      bestie: 'east-wind',
      enemy: 'blank-tile',
    },
    {
      id: 'one-character',
      name: '1 Character',
      chinese: '一萬',
      title: 'The Main Character',
      emoji: '👑',
      tagline: 'Walks to the bodega like it\'s the opening scene of an A24 movie.',
      description: 'Number one, baby. One of one. You romanticize your commute, narrate your life in your head, and have a playlist for every mood, including "staring out the 7 train window like it\'s a music video." Some call it delulu. You call it manifesting. Either way, the camera is always on you, and you are giving the people a show.',
      why: [
        'You\'ve done a GRWM for a trip to H Mart',
        'You\'ve posed for a "candid" at least 40 times',
        'Your camera roll has 200 photos of the same pose and you need all of them',
      ],
      greenFlag: 'Hypes yourself up AND hypes your friends up',
      redFlag: 'Every story somehow ends up being about you',
      bestie: 'red-dragon',
      enemy: 'blank-tile',
    },
    {
      id: 'nine-character',
      name: '9 Character',
      chinese: '九萬',
      title: 'The Big Spender',
      emoji: '🛍️',
      tagline: '"It was on sale." (It was not on sale.)',
      description: '萬 means ten thousand, which is roughly how many online shopping tabs you have open right now. You treat yourself, you treat your friends, you treat the barista. You\'ll fight three aunties for the check at dim sum, and you\'ll win. Your bank account is in its villain era, but your vibes are immaculate.',
      why: [
        'Your delivery driver knows you by name',
        'You\'ve justified a purchase with "cost per wear"',
        'You grabbed the dim sum check so fast your uncle is still mad about it',
      ],
      greenFlag: 'Generous with gifts, time, and snacks',
      redFlag: 'Your "little treat" budget has its own zip code',
      bestie: 'green-dragon',
      enemy: 'white-dragon',
    },
    {
      id: 'one-dot',
      name: '1 Dot',
      chinese: '一筒',
      title: 'The Snack Era',
      emoji: '🥟',
      tagline: 'Round, warm, and thinking about dumplings.',
      description: 'The 1 Dot looks like the top of a mooncake, and so are you: soft, comforting, and a little bit sweet. You plan your whole day around meals, your camera roll is 80% food, and you have never once said no to "want to split something?" Like your mom, you always have snacks in your bag. Everyone feels at home around you because you feed them like it\'s your job.',
      why: [
        'You\'ve ranked every soup dumpling spot within a 2-mile radius',
        'Your love language is "have you eaten yet?"',
        'You\'re the reason the group always ends up at hot pot',
      ],
      greenFlag: 'Feeds everyone. Literally everyone.',
      redFlag: 'Gets hangry and becomes a completely different person',
      bestie: 'autumn',
      enemy: 'orchid',
    },
    {
      id: 'nine-dot',
      name: '9 Dot',
      chinese: '九筒',
      title: 'The Overthinker',
      emoji: '🌀',
      tagline: '47 tabs open in the browser. 47 more in the brain.',
      description: 'Nine dots, nine thoughts per second, zero chill. You\'ve rehearsed a phone call to order takeout. You reread a text you sent four hours ago to check the "tone." At the mahjong table, you\'ve held the same tile for three turns because it might be someone\'s winning tile. But that big brain makes you the funniest, most self-aware person in the room. Your 3am thoughts are elite content.',
      why: [
        'You\'ve typed "haha" and deleted it 6 times',
        'You\'ve planned for a scenario with a 0.01% chance of happening',
        'Your Notes app is a museum of unhinged thoughts',
      ],
      greenFlag: 'Notices everything. Thoughtful to the core.',
      redFlag: 'Spirals for a full day if someone texts "can we talk?"',
      bestie: 'chrysanthemum',
      enemy: 'bamboo',
    },
    {
      id: 'green-dragon',
      name: 'Green Dragon',
      chinese: '發',
      title: 'The Hustler',
      emoji: '💸',
      tagline: '發 means "get rich." You took that personally.',
      description: '發 (fa) is the same 發 as in "gung hei fat choy," and you\'ve had a side hustle since flipping Pokémon cards in third grade. A resale business, a Depop, a "personal brand": you\'ve tried them all and somehow turned a profit. You manifest, you grind, you check your stocks during Lunar New Year dinner. The Lucky Cat approves.',
      why: [
        'You\'ve said "let\'s circle back" in a casual conversation',
        'Your red envelope money went straight into an index fund',
        'Low-key the luckiest person anyone knows',
      ],
      greenFlag: 'Ambitious, and makes it look fun',
      redFlag: 'Turns a friend\'s birthday dinner into a networking event',
      bestie: 'nine-character',
      enemy: 'summer',
    },
    {
      id: 'red-dragon',
      name: 'Red Dragon',
      chinese: '中',
      title: 'The Final Boss',
      emoji: '🔥',
      tagline: 'Center of attention? It\'s literally in the name.',
      description: '中 means "center," and it also means "hit the target." You do both. You walk in and the room rearranges itself around you. At the mahjong table you don\'t play to participate: you play to win, slam the winning tile, and post about it. People call you intimidating. You prefer "iconic." Even the aunties are a little scared of you.',
      why: [
        'You\'ve won an argument you were wrong in',
        'Your "just threw this on" fit took 45 minutes',
        'You slam your winning tile so hard the whole table jumps',
      ],
      greenFlag: 'Defends your friends like it\'s an Olympic sport',
      redFlag: 'Ultra competitive. Even at Uno. Especially at Uno.',
      bestie: 'one-character',
      enemy: 'bamboo',
    },
    {
      id: 'white-dragon',
      name: 'White Dragon',
      chinese: '白板',
      title: 'The Quiet Luxury',
      emoji: '🤍',
      tagline: 'Beige apartment. Loud standards.',
      description: 'The White Dragon is a clean blue frame and absolutely nothing else: the original minimalist. Your apartment is beige, your closet is a capsule, and your 10-step skincare routine exists so your face can look like zero steps. You\'re calm, curated, and a little mysterious. Nobody knows what you\'re thinking, and you like it that way.',
      why: [
        'You own at least 3 of the exact same white tee',
        'Zero unread notifications (genuinely unhinged behavior)',
        'Shoes off at the door, no exceptions',
      ],
      greenFlag: 'Keeps the peace and the countertops clean',
      redFlag: 'Silently judges anyone who leaves dishes in the sink',
      bestie: 'north-wind',
      enemy: 'nine-character',
    },
    {
      id: 'east-wind',
      name: 'East Wind',
      chinese: '東',
      title: 'The Group Chat CEO',
      emoji: '🌅',
      tagline: 'The sun rises in the east. So do you, at 6am, unprompted.',
      description: 'In mahjong, East is the dealer, and in life you\'re the one dealing out the plans. Pure East Coast energy: you walk fast, text faster, and say "okay, so who\'s booking?" and then book it. Calendar invite sent, table for 8 secured, and you remembered who\'s vegetarian. Without you, the group chat is 12 people saying "I\'m down" and nobody doing anything.',
      why: [
        'You\'ve made a group poll for a casual dinner',
        'You wake up before your alarm and you\'re annoyingly happy about it',
        'You got a table for 10 at dim sum on a Sunday with no wait',
      ],
      greenFlag: 'Makes things actually happen',
      redFlag: 'Takes it personally when people don\'t vote in the poll',
      bestie: 'nine-bamboo',
      enemy: 'winter',
    },
    {
      id: 'south-wind',
      name: 'South Wind',
      chinese: '南',
      title: 'The Golden Retriever',
      emoji: '🐶',
      tagline: 'Warm breeze, warm heart, zero thoughts, all vibes.',
      description: 'South Wind brings the warm weather, and you bring warm, SoCal energy everywhere you go. You\'re the hype person, the "OMG YOU LOOK SO GOOD" commenter, the friend who greets everyone like it\'s been years (it\'s been two days). You\'d make friends with every auntie in the 99 Ranch checkout line, and every one of them would try to set you up with their kid.',
      why: [
        'You hug people you met 5 minutes ago',
        'You\'ve cried at a dog video this week',
        'Aunties love you. Like, a concerning amount.',
      ],
      greenFlag: 'Everyone\'s biggest fan, no conditions',
      redFlag: 'Cannot lie. Your face gives it away instantly.',
      bestie: 'one-bamboo',
      enemy: 'north-wind',
    },
    {
      id: 'west-wind',
      name: 'West Wind',
      chinese: '西',
      title: 'The Sunset Romantic',
      emoji: '🌇',
      tagline: 'Golden hour is a personality, and you have it.',
      description: 'The sun sets in the west and so does your heart, every single evening. You romanticize everything: your iced coffee, your commute, a mildly nice cloud. Your camera roll is 40% sunsets, and every single one is "the best one yet." You\'ve written a poem in your Notes app about a stranger at the boba shop. Hopeless romantic? Yes. Thriving? Also yes.',
      why: [
        'You\'ve stopped mid-sentence to photograph the sky',
        'Your Spotify Wrapped is just yearning',
        'You\'ve rewatched the same K-drama finale 4 times and cried every time',
      ],
      greenFlag: 'Makes ordinary days feel like a movie',
      redFlag: 'Falls in love with anyone who holds the door open',
      bestie: 'orchid',
      enemy: 'east-wind',
    },
    {
      id: 'north-wind',
      name: 'North Wind',
      chinese: '北',
      title: 'The Cool Introvert',
      emoji: '🎧',
      tagline: 'Cold exterior. Warm interior. Do not perceive me.',
      description: 'North Wind is chilly, mysterious, and comes from somewhere far away. People think you\'re aloof, but your social battery is just at 2%. You have three close friends, AirPods that never come out, and a deadpan humor that absolutely destroys. At family parties you hide in the back room with the cousins and a phone charger. Once someone gets in, they\'re lucky for life.',
      why: [
        'You\'ve pretended not to see someone you know at H Mart',
        'Your social battery has a 2-hour lifespan',
        'Deadpan jokes that hit 10 seconds later',
      ],
      greenFlag: 'Loyal to the end (to a very select few)',
      redFlag: 'Irish exits every single party',
      bestie: 'white-dragon',
      enemy: 'south-wind',
    },
    {
      id: 'spring',
      name: 'Spring',
      chinese: '春',
      title: 'The Fresh Start',
      emoji: '🌸',
      tagline: 'New hobby, new me. (Again.)',
      description: '春 is the character people stick on their doors for Lunar New Year, and you\'re basically a walking New Year\'s resolution. Pottery, run club, crochet, sourdough, learning mahjong (great choice). You\'ve had about 47 fresh starts this year, and you\'re optimistic about every single one. The hobby gear is collecting dust, but the vibes are blooming.',
      why: [
        'You\'ve bought all the gear for a hobby you tried once',
        'Your "new era" announcements are a monthly event',
        'Eternal optimist: the glass is half full and also sparkling',
      ],
      greenFlag: 'Brings fresh energy into every room',
      redFlag: 'Your hobbies have a two-week half-life',
      bestie: 'summer',
      enemy: 'autumn',
    },
    {
      id: 'summer',
      name: 'Summer',
      chinese: '夏',
      title: 'Out of Office',
      emoji: '😎',
      tagline: 'Hot tile summer, all year round.',
      description: 'Summer is the season of "say yes to everything," and you live there year-round. Beach day? Yes. Spontaneous road trip? Already in the car. K-town karaoke until 4am on a Tuesday? Obviously. You have a tan line in November and a camera roll full of sunsets. You\'ve never experienced FOMO, because you are always there.',
      why: [
        'You\'ve booked a flight on a whim',
        'You know which karaoke room has the best tambourine',
        'You have never once left a party early',
      ],
      greenFlag: 'The most fun person in any room',
      redFlag: 'Replies to texts from a different time zone',
      bestie: 'spring',
      enemy: 'winter',
    },
    {
      id: 'autumn',
      name: 'Autumn',
      chinese: '秋',
      title: 'The Cozy Era',
      emoji: '🍂',
      tagline: 'Oversized sweater, warm drink, candle lit. Always.',
      description: 'Autumn is your whole aesthetic: chunky knits, journaling at a café, and a candle called something like "Cashmere Woods" burning 24/7. Mid-Autumn Festival is your Super Bowl: lanterns, mooncakes, and 40 blurry photos of the moon. You\'re soft, sentimental, and always the first to say "let\'s just stay in and do a puzzle." It\'s giving cottagecore with Wi-Fi.',
      why: [
        'You own more blankets than plates',
        'You start decorating for fall in August',
        'You have a strong opinion on lotus seed vs. red bean mooncakes',
      ],
      greenFlag: 'Makes everyone feel safe and cozy',
      redFlag: 'Will not leave the house if it\'s under 60°F',
      bestie: 'one-dot',
      enemy: 'spring',
    },
    {
      id: 'winter',
      name: 'Winter',
      chinese: '冬',
      title: 'The Hibernator',
      emoji: '😴',
      tagline: 'Canceled plans are my love language.',
      description: 'Winter is here, and so are your blankets. You\'re a professional homebody, a certified blanket burrito, and a world-class napper. House slippers are a lifestyle. When plans get canceled you feel a joy so pure it should be illegal. But when you do show up for hot pot night, everyone\'s thrilled, because you\'re cozy, chill, and you bring the good snacks.',
      why: [
        'Your bed is your office, dining room, and therapist',
        'You\'ve texted "omw!" while still in pajamas',
        'You own a heated blanket, a rice cooker, and no intention of leaving',
      ],
      greenFlag: 'Zero drama, ultra low-maintenance friend',
      redFlag: 'Do Not Disturb has been on since 2022',
      bestie: 'chrysanthemum',
      enemy: 'summer',
    },
    {
      id: 'plum-blossom',
      name: 'Plum Blossom',
      chinese: '梅',
      title: 'The Comeback Kid',
      emoji: '🌺',
      tagline: 'Blooms in the snow. Unbothered. Moisturized.',
      description: 'The plum blossom blooms in the dead of winter, which is why it\'s a classic Chinese symbol of resilience. That\'s you: you\'ve been through it and came out glowing. You\'re the friend everyone calls in a crisis, the group\'s unpaid therapist, and somehow still smiling. You don\'t just bounce back. You bounce back with a new haircut and a 30-day gym streak.',
      why: [
        'You\'ve given life-changing advice while your own life was on fire',
        'Your glow-up arc is legendary',
        'Survived "why not 100%?" and turned out great',
      ],
      greenFlag: 'Strong, steady, and always there for people',
      redFlag: 'Says "I\'m fine" while clearly in a season finale',
      bestie: 'bamboo',
      enemy: 'one-character',
    },
    {
      id: 'orchid',
      name: 'Orchid',
      chinese: '蘭',
      title: 'The Elegant One',
      emoji: '🪷',
      tagline: 'Not high maintenance. Highly curated.',
      description: 'Orchids are graceful, refined, and need very specific conditions to thrive. Sounds about right. You have taste: in music, in food, in restaurants nobody\'s heard of yet. You\'re a plant parent, a matcha snob, and you somehow always smell amazing. Basically, you\'re the orchid on your mom\'s windowsill that\'s been alive since 2009: elegant, a little dramatic, and low-key indestructible.',
      why: [
        'You have opinions about the water temperature for tea',
        'Your plants have names and birthdays',
        'You\'ve said "it\'s giving" about wallpaper',
      ],
      greenFlag: 'Elevates every hangout with impeccable taste',
      redFlag: 'Won\'t eat anywhere under 4.5 stars',
      bestie: 'west-wind',
      enemy: 'one-dot',
    },
    {
      id: 'chrysanthemum',
      name: 'Chrysanthemum',
      chinese: '菊',
      title: 'The Old Soul',
      emoji: '🍵',
      tagline: '24 going on 84.',
      description: 'Chrysanthemums stand for long life, and you\'ve basically lived several already. You order chrysanthemum tea at dim sum unironically, do the crossword, and are in bed by 9:30pm. Your cure for everything is "drink more hot water." You give advice like the wise grandma in a kung fu movie, and nobody knows how you know so much. Your friend group would have fallen apart without you.',
      why: [
        'You\'ve said "kids these days" unironically',
        'Your medical advice is hot water and going to bed early',
        'Your idea of a wild night is a new 1,000-piece puzzle',
      ],
      greenFlag: 'Wise beyond your years and great at advice',
      redFlag: 'Goes to bed before the party even starts',
      bestie: 'nine-dot',
      enemy: 'summer',
    },
    {
      id: 'bamboo',
      name: 'Bamboo',
      chinese: '竹',
      title: 'The Go-With-The-Flow',
      emoji: '🐼',
      tagline: 'Bends, never breaks. Also low-key a panda.',
      description: 'Bamboo sways in the wind and never snaps, and you\'re just as chill. Plans changed? Cool. Two-hour wait at the dim sum spot? We\'ll find another one. You\'re the lucky bamboo from the Chinatown florist: low-maintenance, good vibes, and somehow always thriving. Pandas would trust you. Your friends definitely do.',
      why: [
        'Your answer to "where do you want to eat?" is a genuine "anything!"',
        'You have never once stressed about running late',
        'You grow on people fast (like, actual bamboo fast)',
      ],
      greenFlag: 'Unshakeable calm in any storm',
      redFlag: 'Cannot make a decision to save your life',
      bestie: 'plum-blossom',
      enemy: 'red-dragon',
    },
    {
      id: 'blank-tile',
      name: 'Blank Tile',
      chinese: '空白',
      title: 'The Spare',
      emoji: '🫥',
      tagline: 'Wasn\'t supposed to be in the box. Showed up anyway.',
      description: 'Plot twist: you\'re the blank tile. The spare. The "wait, what\'s this one for?" Your grandma uses you to replace the tile she lost in 1997. You have no suit, no number, no rules, and you are thriving. Unpredictable, unbothered, a total wildcard. Nobody knows what you\'re going to do next, including you.',
      why: [
        'You\'ve shown up to a party without knowing whose party it was',
        'Your vibe is "loading…" and somehow it works',
        'You show up to Lunar New Year empty-handed and still get the biggest red envelope',
      ],
      greenFlag: 'Fits in anywhere, gets along with everyone',
      redFlag: 'Your five-year plan is a shrug emoji',
      bestie: 'nine-dot',
      enemy: 'nine-bamboo',
    },
  ];

  var QUESTIONS = [
    {
      text: 'It\'s Friday night. Where are you?',
      options: [
        { emoji: '📊', text: 'Organizing dinner for 8 (I made a group poll)', tiles: ['east-wind', 'nine-bamboo', 'south-wind'] },
        { emoji: '🎤', text: 'K-town karaoke until 4am. No plans, all vibes.', tiles: ['summer', 'red-dragon', 'nine-character'] },
        { emoji: '🛋️', text: 'Blanket burrito. Phone at 3%. Do not perceive me.', tiles: ['winter', 'one-dot'] },
        { emoji: '🎨', text: 'At a sip-and-paint night I found on Instagram', tiles: ['spring', 'orchid', 'chrysanthemum'] },
      ],
    },
    {
      text: 'What\'s your role in the group chat?',
      options: [
        { emoji: '🎙️', text: 'The yapper. Voice memos and breaking news.', tiles: ['one-bamboo', 'south-wind', 'one-character'] },
        { emoji: '👍', text: 'Leaves it on read, hearts it 3 days later', tiles: ['north-wind', 'winter'] },
        { emoji: '🧾', text: 'Books the table and sends the Splitwise before dessert', tiles: ['nine-bamboo', 'east-wind', 'white-dragon'] },
        { emoji: '🐸', text: 'Sends reels at 3am that nobody asked for', tiles: ['nine-dot', 'summer'] },
      ],
    },
    {
      text: 'Pick your drink order:',
      options: [
        { emoji: '☕', text: 'Iced oat latte, extra shot. I have meetings.', tiles: ['one-character', 'nine-bamboo', 'green-dragon'] },
        { emoji: '🧋', text: 'Bubble tea, 100% sugar, no regrets', tiles: ['one-dot', 'autumn', 'winter'] },
        { emoji: '🫖', text: 'Hot water. Mom said cold drinks are bad for you.', tiles: ['chrysanthemum', 'plum-blossom'] },
        { emoji: '🍵', text: 'Ceremonial-grade matcha. I can taste the difference.', tiles: ['orchid', 'white-dragon'] },
      ],
    },
    {
      text: 'Your relationship with money is…',
      options: [
        { emoji: '📈', text: '3 side hustles and a high-yield savings account', tiles: ['green-dragon', 'nine-bamboo', 'east-wind'] },
        { emoji: '🕯️', text: '"It\'s an investment." (It\'s a $90 candle.)', tiles: ['nine-character', 'orchid'] },
        { emoji: '🍜', text: 'Spent it all on food. No regrets.', tiles: ['one-dot', 'summer'] },
        { emoji: '✨', text: 'What money? I run on vibes.', tiles: ['blank-tile', 'spring', 'bamboo'] },
      ],
    },
    {
      text: 'Be honest. Your toxic trait is…',
      options: [
        { emoji: '📱', text: 'Overthinking a text for 45 minutes', tiles: ['nine-dot', 'west-wind'] },
        { emoji: '🏆', text: 'Turning everything into a competition', tiles: ['red-dragon', 'green-dragon', 'east-wind'] },
        { emoji: '🎬', text: 'Main-charactering on the subway with my headphones in', tiles: ['one-character', 'west-wind', 'summer'] },
        { emoji: '🙅', text: 'Canceling plans and feeling zero guilt', tiles: ['winter', 'north-wind'] },
      ],
    },
    {
      text: 'Pick a season to live in forever:',
      options: [
        { emoji: '🌸', text: 'Cherry blossoms and fresh starts', tiles: ['spring', 'plum-blossom', 'one-bamboo', 'east-wind'] },
        { emoji: '🏖️', text: 'Beach days and sunburns', tiles: ['summer', 'south-wind'] },
        { emoji: '🍂', text: 'Sweater weather and journaling', tiles: ['autumn', 'west-wind', 'chrysanthemum'] },
        { emoji: '❄️', text: 'Snow days and hot pot', tiles: ['winter', 'plum-blossom'] },
      ],
    },
    {
      text: 'Your friends would describe you as…',
      options: [
        { emoji: '🐕', text: 'A golden retriever in human form', tiles: ['south-wind', 'one-bamboo', 'spring'] },
        { emoji: '🧊', text: 'Intimidating… until they get to know you', tiles: ['north-wind', 'red-dragon', 'white-dragon'] },
        { emoji: '🫶', text: 'The mom friend / unpaid therapist', tiles: ['plum-blossom', 'bamboo', 'chrysanthemum'] },
        { emoji: '🌪️', text: 'Chaotic, but lovable', tiles: ['nine-dot', 'blank-tile', 'nine-character'] },
      ],
    },
    {
      text: 'At the mahjong table, you\'re…',
      options: [
        { emoji: '🐉', text: 'Going for Thirteen Orphans every single game', tiles: ['nine-character', 'red-dragon', 'one-character'] },
        { emoji: '🧮', text: 'Counting faan in my head before I\'ve even won', tiles: ['nine-bamboo', 'nine-dot', 'green-dragon'] },
        { emoji: '🥟', text: 'Mostly here for the snacks and the gossip', tiles: ['one-dot', 'one-bamboo', 'autumn'] },
        { emoji: '🍀', text: 'Winning on beginner\'s luck with no idea how', tiles: ['blank-tile', 'bamboo', 'spring'] },
      ],
    },
    {
      text: 'What\'s on your phone lock screen?',
      options: [
        { emoji: '🤳', text: 'A group selfie where I look the best', tiles: ['one-character', 'red-dragon', 'one-bamboo'] },
        { emoji: '🌇', text: 'A sunset I took 4 years ago', tiles: ['west-wind', 'autumn'] },
        { emoji: '📵', text: 'The default one. Too many choices, so I never changed it.', tiles: ['blank-tile', 'white-dragon', 'nine-dot'] },
        { emoji: '🪴', text: 'My pet. Or my plant. Same thing.', tiles: ['orchid', 'bamboo', 'south-wind'] },
      ],
    },
    {
      text: 'Lunar New Year at the family\'s. You\'re…',
      options: [
        { emoji: '📸', text: 'Taking 300 photos for the family group chat', tiles: ['one-bamboo', 'west-wind', 'one-character'] },
        { emoji: '🀄', text: 'At the mahjong table with the uncles until 2am', tiles: ['east-wind', 'nine-bamboo', 'green-dragon'] },
        { emoji: '🥟', text: 'In the kitchen wrapping dumplings (and eating them)', tiles: ['one-dot', 'plum-blossom', 'south-wind'] },
        { emoji: '🙈', text: 'Hiding from aunties asking about my salary and love life', tiles: ['north-wind', 'winter', 'blank-tile'] },
      ],
    },
    {
      text: 'Pick your dim sum must-order:',
      options: [
        { emoji: '🦐', text: 'Har gow. Classic, clean, perfect.', tiles: ['white-dragon', 'orchid', 'chrysanthemum'] },
        { emoji: '🥧', text: 'Egg tarts. Sweet, golden, everyone\'s favorite.', tiles: ['autumn', 'summer', 'spring'] },
        { emoji: '🐔', text: 'Chicken feet. Misunderstood, but iconic.', tiles: ['north-wind', 'red-dragon', 'nine-dot'] },
        { emoji: '🛒', text: 'Whatever the cart auntie brings. All of it.', tiles: ['bamboo', 'one-dot', 'blank-tile', 'nine-character'] },
      ],
    },
    {
      text: 'Pick a life motto:',
      options: [
        { emoji: '🎋', text: '"Bend, don\'t break."', tiles: ['bamboo', 'plum-blossom'] },
        { emoji: '💰', text: '"Secure the bag."', tiles: ['green-dragon', 'nine-character'] },
        { emoji: '🤍', text: '"Less is more."', tiles: ['white-dragon', 'north-wind', 'chrysanthemum'] },
        { emoji: '🎞️', text: '"Romanticize everything."', tiles: ['west-wind', 'autumn', 'orchid'] },
      ],
    },
  ];

  var TILE_MAP = {};
  TILES.forEach(function (t) { TILE_MAP[t.id] = t; });

  // IDs used before the descriptive slugs; links with these were already shared, so keep them working.
  var LEGACY_TILE_IDS = {
    'bamboo-1': 'one-bamboo',
    'bamboo-9': 'nine-bamboo',
    'character-1': 'one-character',
    'character-9': 'nine-character',
    'dot-1': 'one-dot',
    'dot-9': 'nine-dot',
    'plum': 'plum-blossom',
    'bamboo-flower': 'bamboo',
    'blank': 'blank-tile',
  };

  function getTile(id) {
    return TILE_MAP[id] || TILE_MAP[LEGACY_TILE_IDS[id]] || null;
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
    if (getTile(state.tile)) state.tile = getTile(state.tile).id;
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

    // Fisher-Yates shuffle, so the intro shows a different random set of tiles on every visit.
    function shuffle(list) {
      var copy = list.slice();
      for (var i = copy.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    }

    function renderIntro() {
      // The blank tile stays a surprise; the intro copy only hints at it.
      var parade = shuffle(TILES.map(function (t) { return t.id; }).filter(function (id) { return id !== 'blank-tile'; })).slice(0, 3);
      $('#tq-parade').innerHTML = parade.map(function (id, i) {
        return '<div class="tq-parade-tile" style="--i:' + i + '">' + art(id) + '</div>';
      }).join('');

      var note = $('#tq-returning');
      var mine = getTile(state.tile);
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

      $('#tq-result-bestie').innerHTML = renderRelation(getTile(tile.bestie));
      $('#tq-result-enemy').innerHTML = renderRelation(getTile(tile.enemy));

      $('#tq-share-heading').textContent = isMine ? 'Share your tile' : 'Send this to the friend who\'s a ' + tile.name;
      card.setAttribute('data-mine', isMine ? 'true' : 'false');
      resultTile = tile;
      renderGallery(tile.id);
    }

    // Other tiles' results only become browsable once this visitor has taken the quiz.
    function hasTakenQuiz() {
      return !!getTile(state.tile);
    }

    function renderRelation(other) {
      if (!other) return '';
      var inner = '<span class="tq-relation-art">' + art(other.id) + '</span>' +
        '<span class="tq-relation-text"><strong>' + escapeHtml(other.name) + '</strong>' +
        '<span class="tq-muted">' + escapeHtml(other.title) + '</span></span>';
      return hasTakenQuiz()
        ? '<a class="tq-relation-link" href="' + escapeHtml(shareUrl(root.location.href, other.id)) + '">' + inner + '</a>'
        : '<div class="tq-relation-link">' + inner + '</div>';
    }

    function renderGallery(activeId) {
      var grid = $('#tq-gallery-grid');
      if (!grid) return;
      $('#tq-gallery').hidden = !hasTakenQuiz();
      if (!hasTakenQuiz()) return;
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
      var lines = [];
      var line = '';
      text.split(' ').forEach(function (word) {
        var test = line ? line + ' ' + word : word;
        if (line && ctx.measureText(test).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      if (line) lines.push(line);
      return lines;
    }

    function loadSvgImage(svg) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
    }

    // Instagram portrait (1080x1350, 4:5) card: tile art, name, title, tagline and the full description.
    function buildShareImage(tile) {
      var W = 1080;
      var H = 1350;
      var PAD = 80;
      var color = root.LuckyCatTileArt.colorFor(tile.id);
      var heading = '"KN Yuanmo SC", "PingFang SC", sans-serif';
      var body = '"Avenir Next", Avenir, -apple-system, "Segoe UI", sans-serif';
      var canvas = doc.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');
      var fontsReady = doc.fonts && doc.fonts.load
        ? doc.fonts.load('64px "KN Yuanmo SC"').catch(function () {})
        : Promise.resolve();

      return Promise.all([fontsReady, loadSvgImage(root.LuckyCatTileArt.render(tile.id, { width: 300 }))]).then(function (loaded) {
        var img = loaded[1];

        ctx.fillStyle = '#FFF8F0';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(W / 2, 480, 230, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, W, 16);
        ctx.fillRect(0, H - 16, W, 16);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#5C5C5C';
        ctx.font = '600 38px ' + body;
        ctx.fillText('I\'m the', W / 2, 96);
        var nameText = tile.name + ' ' + tile.chinese;
        var nameSize = 88;
        do {
          ctx.font = nameSize + 'px ' + heading;
          nameSize -= 4;
        } while (ctx.measureText(nameText).width > W - PAD * 2 && nameSize > 48);
        ctx.fillStyle = color;
        ctx.fillText(nameText, W / 2, 188);
        ctx.fillStyle = '#1A1A1A';
        ctx.font = '48px ' + heading;
        ctx.fillText(tile.emoji + ' ' + tile.title, W / 2, 258);

        ctx.drawImage(img, W / 2 - 150, 290, 300, 375);

        var y = 735;
        ctx.fillStyle = '#1A1A1A';
        ctx.font = '700 38px ' + body;
        wrapLines(ctx, tile.tagline, W - PAD * 2).forEach(function (line) {
          ctx.fillText(line, W / 2, y);
          y += 50;
        });

        // Shrink the description until it fits above the footer.
        var maxBottom = 1195;
        var size = 32;
        var lines;
        do {
          ctx.font = '500 ' + size + 'px ' + body;
          lines = wrapLines(ctx, tile.description, W - PAD * 2);
          size -= 2;
        } while (y + 14 + lines.length * (size + 2) * 1.4 > maxBottom && size > 22);
        var lineHeight = (size + 2) * 1.4;
        y += 14;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3D3D3D';
        lines.forEach(function (line) {
          y += lineHeight;
          ctx.fillText(line, PAD, y);
        });

        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.font = '44px ' + heading;
        ctx.fillText('Which mahjong tile are you?', W / 2, 1262);
        ctx.fillStyle = '#5C5C5C';
        ctx.font = '600 30px ' + body;
        ctx.fillText('luckycatmahjong.com', W / 2, 1310);

        return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      });
    }

    function downloadImage() {
      var tile = resultTile;
      var button = $('#tq-download');
      button.disabled = true;
      buildShareImage(tile).then(function (blob) {
        var filename = 'lucky-cat-mahjong-' + tile.id + '.png';
        var file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
        // Phones: the share sheet's "Save Image" puts it in the camera roll, ready for a story.
        if (file && root.navigator.canShare && root.navigator.canShare({ files: [file] }) && /Mobi|Android|iPhone|iPad/i.test(root.navigator.userAgent)) {
          return root.navigator.share({ files: [file], title: tile.name }).catch(function () {});
        }
        var a = doc.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        doc.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast('Downloaded! Perfect for your story 📸');
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
      $('#tq-download').addEventListener('click', downloadImage);
      $('#tq-hero-cta').addEventListener('click', startQuiz);
      $('#tq-share').addEventListener('click', shareLink);
    }

    function init() {
      bind();
      renderIntro();
      var params = new URLSearchParams(root.location.search);
      var shared = getTile(params.get('tile'));
      if (shared) {
        if (params.get('tile') !== shared.id) setUrlTile(shared.id);
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
