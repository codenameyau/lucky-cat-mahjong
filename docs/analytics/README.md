# Analytics

The site uses **Google Analytics 4** to learn which pages and buttons people use: which calls to action bring in bookings, how far people get through the tile quiz, and how the mahjong game is played. This page explains how tracking is set up, what's never collected, how to read and add events, and every event the site sends.

## Setup

- **Property**: one GA4 property, measurement ID `G-B514HH987M`, for the whole site.
- **Where it loads**: each page's `<head>` has the same small snippet. It defines `gtag`, then adds Google's `gtag.js` script only when the page isn't on a local address. The pages that load it: the homepage (`index.html`), the Points Guide, Community, Events, the tile quiz, the Play Mahjong options page (`/play-mahjong/`) and the game (`/playing-mahjong/`, where playback is a view).
- **Page views** are recorded by GA4 automatically (`gtag('config', ...)`). Everything else is a custom event, sent with `gtag('event', name, params)`.

## Privacy

- **Never sent**: names, Instagram handles, email addresses, zip codes, or anything typed into a form. The booking form sends only that it was submitted and which service was picked.
- **No tracking while developing**: on `localhost`, `127.x.x.x`, `::1`, `192.168.x.x`, `10.x.x.x`, `172.16–31.x.x` or a `.local` name, the snippet never adds Google's script and `gtag` does nothing, so testing adds no events. `js/analytics-local.test.js` checks every page that loads analytics has this check, that the script isn't hard-coded into the page, and that all of those addresses count as local.
- **Game content isn't sent**: the mahjong game sends button clicks and how a hand ended (win, loss or draw, and the faan), never the tiles or moves.
- **Links off the site** send only the address's host (`github.com`), never its path or query.
- **User properties** are only `player_type` (`new` or `returning`, from a count of games kept in this browser's `lcm-analytics`) and `theme`.

## How events are sent

Each part of the site has a small helper that calls `gtag('event', ...)` only if `gtag` exists:

| Where | Helper | How events are named |
| --- | --- | --- |
| Homepage (`js/main.js`) | `track(name, params)` | From the clicked element's `data-evt`. Add `data-loc` for the `location` parameter, and `data-channel` to also send a channel event (see below). One click listener covers the whole page. |
| Header on every page (`js/nav.js`) | `trackNav(name, params)` | Adds `page` (the path) to every event |
| Tile quiz (`js/tile-quiz.js`) | `track(name, params)` | Written out at each step. One click listener names gallery, related-tile, returning-visitor and call-to-action links. |
| Play and playback (`js/mahjong-game.js`) | `track(name, params)` | `BUTTON_EVENTS` maps the table's canvas buttons to events by button id. Settings, dialogs and the end of a hand call `track` directly. |

### Unique and channel events

Each homepage call to action sends two events:

- A **unique event** for that exact button, such as `email_click_mobilebar`, so each placement can be compared.
- A **channel event** for the kind of contact, such as `email_click`, sent by every button of that kind, so totals are one number. It carries `source_event`, the unique event that sent it.

| Channel | Sent by |
| --- | --- |
| `email_click` | `email_click_cta`, `email_click_mobilebar`, `email_click_quotenote`, and the booking form (`book_session_submit`) |
| `instagram_message` | `instagram_message_hero`, `instagram_message_mobilebar`, `instagram_message_quotenote` |
| `instagram_profile` | `instagram_profile_cta` |

### Naming

Event names are lowercase with underscores, and start with the area: `nav_`, `tile_quiz_`, `play_`, `outbound_`, `offline_`, `app_`. A click on a button ends in `_click`, opening or closing something is `_open`/`_close`, and a setting change is `_set_`. Parameters are lowercase too, and reuse existing names (`location`, `link`, `tile`, `mode`) where they mean the same thing.

## Reading the data in GA4

- **Events**: Reports › Engagement › Events lists every event and its count.
- **Parameters**: GA4 shows a parameter in reports only once it's registered as an event-scoped **custom dimension** (Admin › Custom definitions). Register the ones you want to break down by: `location`, `source_event`, `link`, `page`, `tile`, `skill_level`, `method`, `answer_label`, `mode`, `result`, `faan`, `coach`, `coach_strategy`, `strategy`, `hand`. Numbers you want to total, like `faan`, `hands` or `wins`, can be custom metrics instead.
- **Live checks**: Reports › Realtime, or Admin › DebugView with the [Google Analytics Debugger](https://chromewebstore.google.com/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna) extension, shows events as they arrive from the live site. (A local preview sends nothing.)
- **Funnels**: Explore › Funnel exploration works well for the quiz (`tile_quiz_start` › `tile_quiz_question_view` › `tile_quiz_complete` › `tile_quiz_submit`) and the game (`play_start_click` › `play_start` › `play_hand_end`).

## Adding an event

1. Pick a name that follows the naming above, and check it isn't already used.
2. Send it with the helper for that part of the site. On the homepage, add `data-evt` (and `data-loc`, and `data-channel` if it's a contact) to the element: no JavaScript needed. On the play page's canvas, add the button id to `BUTTON_EVENTS`.
3. Never put personal details or free text from a form in a parameter.
4. Add it to the tables below.
5. Check it on the live site in Realtime or DebugView. Register any new parameter as a custom dimension.

## Events

### Homepage

Every event has `location`: where on the page the button is (`hero`, `cta`, `mobile_bar`, `quote_form`, `quote_note`).

| Event | When it fires | Extra parameters |
| --- | --- | --- |
| `book_session_hero` | The hero's Book a session button | |
| `book_session_submit` | The booking form is sent | `service` (the service picked) |
| `email_click_cta`, `email_click_mobilebar`, `email_click_quotenote` | An email link: the call-to-action section, the phone bar, the note under the form | |
| `instagram_message_hero`, `instagram_message_mobilebar`, `instagram_message_quotenote` | An Instagram message link | |
| `instagram_profile_cta` | The Instagram profile link in the call-to-action section | |
| `email_click`, `instagram_message`, `instagram_profile` | Channel events, with every unique event above ([how they work](#unique-and-channel-events)) | `source_event` |
| `community_link_hero`, `events_link_hero`, `scoring_link_hero`, `quiz_link_hero`, `play_link_hero` | The hero's links to the other pages | |
| `play_link_cta` | The Play link in the call-to-action section | |

### Header (every page)

| Event | When it fires | Parameters |
| --- | --- | --- |
| `nav_click` | A link in the header | `link` (its text, or `Home` for the logo), `page` |
| `nav_toggle_click` | The phone menu button | `page` |
| `outbound_click` | Any link to another site, anywhere on a page with the header (credits, Instagram, GitHub, Ticket Tailor) | `link_domain` (host only, without `www.`), `link_type` (`github`, `instagram`, `tickettailor`, `huggingface` or `other`), `page` |

GA4's own enhanced measurement can also send `click` with `outbound: true`. `outbound_click` is the site's version, with the kind of link, and is the one the reporting guide uses.

### Offline and installing the app (pages that load `js/offline.js`)

| Event | When it fires | Parameters |
| --- | --- | --- |
| `offline_ready` | This load saved the files that were missing, and the whole site and game now work offline: once per version saved | `version` |
| `offline_partial` | This load tried to save them and some failed | `version`, `failed_count` |
| `app_install_prompt` | The browser offered to install the site as an app (`beforeinstallprompt`; Chrome and Edge only) | |
| `app_installed` | It was installed (`appinstalled`) | |
| `app_open_installed` | A page opened from the installed app's icon (standalone display) | |

### Tile quiz (`/which-mahjong-tiles-are-you/`)

| Event | When it fires | Parameters |
| --- | --- | --- |
| `tile_quiz_start_click` | A Start button | `location` |
| `tile_quiz_start` | The quiz starts | |
| `tile_quiz_question_view` | A question is shown | `question_index` |
| `tile_quiz_answer_click` | An answer is picked | `question_index`, `answer_index`, `answer_label` |
| `tile_quiz_q1_a1` … `tile_quiz_q12_a4` | Also sent for each answer: question *n*, answer *m*, counting from 1 in the order of `QUESTIONS` in `js/tile-quiz.js` | `question_index`, `answer_index`, `answer_label` |
| `tile_quiz_back_click` | Back to the previous question | `question_index` |
| `tile_quiz_complete` | The result is shown | `tile` |
| `tile_quiz_skill_click` | A skill level is picked | `skill_level` |
| `tile_quiz_submit_click` | Submit on the info step | |
| `tile_quiz_submit` | The result is submitted | `tile`, `skill_level` |
| `tile_quiz_info_back_click` | Back from the info step to the result | |
| `tile_quiz_share_click`, `tile_quiz_share` | Share is clicked; a share completes | `tile`, `method` (`native` or `copy_link`) |
| `tile_quiz_download_click` | Download the result card | `tile` |
| `tile_quiz_view_shared` | Someone who has taken the quiz opens a shared result link | `tile` |
| `tile_quiz_locked_view` | Someone who hasn't taken the quiz yet opens a shared result link, and is asked to take it to unlock the tile | `tile` |
| `tile_quiz_gallery_click`, `tile_quiz_relation_click`, `tile_quiz_returning_click` | A tile in the gallery, a related tile, the returning-visitor link | `tile` |
| `tile_quiz_cta_click` | A call-to-action link out of the quiz | `link` |

The per-answer events count how often each answer is picked with no GA4 setup. Going back and answering again counts again.

### Play Mahjong (`/play-mahjong/`) and playback

Every button is tracked except the tiles and the buttons that play a move (Win, Kong, Pung, Chow, Pass, Discard), so the events say how people use the game, not how they play.

**Starting and ending**

| Event | When it fires | Parameters |
| --- | --- | --- |
| `play_mode_select` | A game mode is picked on the start screen | `mode` (`practice` or `payout`) |
| `play_start_click`, `play_resume_click` | Start new game; Resume game | `mode` (start only) |
| `play_learn_click` | Learn to play (the guided lesson) | |
| `play_start`, `play_resume` | A game starts or resumes, or the lesson starts | `lesson` (true for the guided lesson), `spicy`, `mode`, `coach`, `speed`, `coach_strategy` (the coach's strategy), `strategies` (the computer seats' strategies), `games_started` (start only, not the lesson: how many games this browser has started, counting this one) |
| `play_hand_end` | A hand ends | `result` (`win`, `loss` or `draw`), `faan` (the winner's faan, else 0), `hand_number` (hands finished this game), `lesson`, `mode` |
| `play_game_over` | The last hand of a game ends | `hands`, `wins`, `mode` |
| `play_lesson_step` | In the guided lesson, you made the move it asked for | `step` (how far through its script, counting every seat's moves) |
| `play_lesson_complete` | The lesson's hand ended | `result` (`win`, else `other`) |
| `play_restart`, `play_copy_seed` | Restart the hand; copy the hand's seed | |

**Table buttons and menus**

| Event | When it fires | Parameters |
| --- | --- | --- |
| `play_menu_open`, `play_menu_resume_click`, `play_menu_restart_click`, `play_menu_quit_click` | The Menu and its buttons | |
| `play_fullscreen_click`, `play_show_hands_click`, `play_next_hand_click`, `play_see_results_click` | Table buttons | |
| `play_open_results`, `play_close_results` | The results sheet | |
| `play_again_click`, `play_end_quit_click`, `play_end_results_click`, `play_end_close_click` | The end-of-game buttons: Play again, Quit, Results, and Close (which steps aside to the table with every hand face up) | |
| `play_open_rules`, `play_close_rules`, `play_rule_click` | The rules sheet; a rule row | `hand` (row only) |
| `play_coach_detail` | A Coach settings choice (Simple, Detailed or Complex) | `detail` |
| `play_open_strategies`, `play_close_strategies`, `play_strategy_details_click` | The Strategies sheet; a strategy's details | `open` (details only) |
| `play_credit_click` | A music or art credit link | `link` |

**Settings**

| Event | When it fires | Parameters |
| --- | --- | --- |
| `play_set_coach` | The Coach button cycles | `coach` (`on`, `feedback` or `off`) |
| `play_set_coach_strategy` | A different strategy coaches | `strategy`, and `playback: true` on the playback page |
| `play_set_sound` | The Sound button | `sound` (`on` or `off`) |
| `play_set_theme` | The menu's Theme button | `theme` (`red`, `green` or `blue`); the `theme` user property is set on load and on each change |

**Playback**

| Event | When it fires | Parameters |
| --- | --- | --- |
| `play_view_replay` | View playback of a hand | |
| `play_playback_view` | A playback is loaded on the table: the one to count for "watched a playback" | `source`: `game` (the game's own hand), `recent` (Saved playbacks) or `upload` |
| `play_playback_prev_click`, `play_playback_next_click`, `play_playback_play_click`, `play_playback_pause_click` | Step and play controls | |
| `play_playback_speed` | The playback speed changes | `speed` |
| `play_playback_back_click`, `play_playback_list_click` | Back, and Saved playbacks (the bar's button, or the one in the center with no hand loaded) | |
| `play_playback_list_play`, `play_playback_list_download` | In the Saved playbacks sheet: Play or Download on a row | `kind`: `recent` or `upload` |
| `play_playback_upload_click` | Upload playback, in the Saved playbacks sheet | |
| `play_playback_upload_failed` | An uploaded or pasted playback was rejected and the could-not-be-uploaded popup showed | `code`: `signature`, `damaged`, `notFile` or `version` |
| `play_playback_toggle_hands` | A double-click on an opponent's hand in a finished hand's playback hid or showed their tiles | `shown`: true or false |
| `play_playback_list_copy_seed` | Copy hand seed on a row of the Saved playbacks sheet | `kind`: `recent` or `upload` |
| `play_autoplay` | Your wind badge turned auto-play on or off (development addresses only, which send no analytics) | `on`: true or false |
| `play_playback_results` | A playback reached its last move and showed the hand's results | `result`: `win` or `draw` |
| `play_playback_coach_note_click` | A coach note, jumping to its move | |

## Testing

- `js/analytics-local.test.js` (in `npm test`) checks the local-address rule on every page.
- `js/tile-quiz.test.js` checks the quiz's events with a fake `gtag` that records every call.
- `every tracked event is documented` (in `js/analytics-local.test.js`) fails when the code sends an event this page doesn't list.
- **Locally**, nothing is sent, but each `gtag` call is kept in `window.lcmLocalEvents`. On `localhost:8080`, play a little and run `lcmLocalEvents.filter(e => e[0] === 'event')` in the console to see what the live site would have sent.
- To see events arrive in GA, use the live site with DebugView open.

For which custom dimensions to register, and the explorations and funnels to build, see the [reporting guide](reporting.md).
