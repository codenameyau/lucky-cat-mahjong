# Analytics reporting guide

How to turn the site's Google Analytics 4 events into reports that show how people use Lucky Cat Mahjong: where they arrive, whether they play, whether they finish a hand, how far they get through the lesson and the quiz, and whether they come back. Every event and parameter is listed in the [analytics README](README.md); this page says which to register in GA4 and how to read them.

Property: `G-B514HH987M`. Everything below is done in the GA4 web UI (analytics.google.com), or through the GA4 Admin API, by the account owner or with their OK.

## 1. Register custom dimensions

GA4 collects every parameter, but shows one in reports and explorations only once it's registered. Register them in **Admin › Data display › Custom definitions › Create custom dimension**. Use the parameter name as the dimension name, so reports read the same as the code. A standard property allows 50 event-scoped and 25 user-scoped dimensions; this list uses 22 and 2.

Data is only collected into a dimension from the day it's registered, not before, so register them all at once.

**User-scoped** (Scope: User; "User property" is the name below)

| Dimension | Values | Use |
| --- | --- | --- |
| `player_type` | `new`, `returning` | Players who have started more than one game in this browser |
| `theme` | `red` (the default), `green`, `blue` | The table theme a player uses: set when the game page loads and when it changes |

**Event-scoped** (Scope: Event; "Event parameter" is the name below)

| Dimension | From events | Use |
| --- | --- | --- |
| `mode` | `play_start`, `play_hand_end`, `play_game_over`, `play_mode_select`, `play_start_click` | Practice or payout |
| `lesson` | `play_start`, `play_hand_end` | Split the guided lesson from real games |
| `result` | `play_hand_end`, `play_lesson_complete`, `play_playback_results` | Win, loss or draw |
| `coach` | `play_start` | Coach on, feedback or off at the start |
| `detail` | `play_coach_detail` | Coach level picked: Simple, Detailed or Complex |
| `coach_strategy` | `play_start` | The coach's strategy at the start |
| `strategy` | `play_set_coach_strategy` | Strategy picked to coach |
| `strategies` | `play_start` | The three computer seats' strategies |
| `speed` | `play_start` | Game speed |
| `source` | `play_playback_view` | Where a playback came from: `game`, `recent`, `upload` |
| `step` | `play_lesson_step` | How far through the lesson |
| `link_type` | `outbound_click` | `github`, `instagram`, `tickettailor`, `huggingface`, `other` |
| `link_domain` | `outbound_click` | The site a link leaves to |
| `page` | `nav_click`, `nav_toggle_click`, `outbound_click` | The page the click was on |
| `link` | `nav_click`, `play_credit_click`, `tile_quiz_cta_click` | Which link |
| `location` | Homepage events, `tile_quiz_start_click` | Where on the page |
| `source_event` | `email_click`, `instagram_message`, `instagram_profile` | Which button sent a channel event |
| `service` | `book_session_submit` | Service picked in the booking form |
| `tile` | `tile_quiz_*` | The quiz's result tile |
| `skill_level` | `tile_quiz_skill_click`, `tile_quiz_submit` | Skill level picked in the quiz |
| `question_index` | `tile_quiz_question_view`, `tile_quiz_answer_click` | Quiz question (0-based) |
| `hand` | `play_rule_click` | Which rule row |

**Custom metrics** (Admin › Custom definitions › Custom metrics; Scope: Event, Unit: Standard)

| Metric | From | Use |
| --- | --- | --- |
| `faan` | `play_hand_end` | Average faan of a won hand |
| `hand_number` | `play_hand_end` | How many hands into a game people get |
| `games_started` | `play_start` | Games per browser |

## 2. Mark key events

In **Admin › Data display › Events**, switch on **Mark as key event** for:

- `play_start` (someone started playing),
- `play_hand_end` (someone finished a hand),
- `play_game_over` (someone finished a whole game),
- `tile_quiz_complete`,
- `book_session_submit` (the business's own conversion).

Key events show up in the Acquisition reports, so you can see which sources bring people who play, not just people who visit. An event appears in this list after it has been received once from the live site.

## 3. Build the explorations

All in **Explore**. Each one: **Blank** exploration, pick the technique, add the dimensions and metrics named, and save it with the name given.

### Landing → play → finish a hand ("Play funnel")

Technique: **Funnel exploration**, **Open funnel** off (closed: steps in order), time period the last 28 days.

| Step | Condition |
| --- | --- |
| 1. Landed | Event `page_view` |
| 2. Opened Play | Event `page_view` with `page_location` contains `/play-mahjong/` |
| 3. Started a game | Event `play_start`, with `lesson` = `false` |
| 4. Finished a hand | Event `play_hand_end`, with `lesson` = `false` |
| 5. Finished a game | Event `play_game_over` |

- **Breakdown**: `Session default channel group` (or `First user source`), then try `Device category`.
- **Show elapsed time** on, to see how long people take to get from one step to the next.
- **Reading it**: the biggest drop is where to work. A drop at 2 → 3 is the start screen (`/play-mahjong/`); 3 → 4 is the first hand (too hard or too slow: check `play_menu_quit_click` and `play_coach_detail`); 4 → 5 is the length of a game. Compare the channels: a source with many landings and few finished hands is bringing visitors who don't want to play.

### Lesson progress ("Lesson funnel")

Technique: **Funnel exploration**, closed.

| Step | Condition |
| --- | --- |
| 1. Clicked Learn to play | Event `play_learn_click` |
| 2. Lesson started | Event `play_start` with `lesson` = `true` |
| 3. Made the first move | Event `play_lesson_step` |
| 4. Finished the lesson | Event `play_lesson_complete` |
| 5. Played a real game | Event `play_start` with `lesson` = `false` |

- To see where in the lesson people stop: a **Free form** exploration with rows `step`, values `Event count` and `Total users`, filtered to `Event name` = `play_lesson_step`. The count falls step by step; a sudden fall at one step is a move the lesson doesn't explain well enough.
- Step 5 is the one that matters: does the lesson turn people into players?

### Quiz progress ("Quiz funnel")

Technique: **Funnel exploration**, closed: `tile_quiz_start` → `tile_quiz_question_view` → `tile_quiz_complete` → `tile_quiz_submit`. For drop-off by question, a Free form with rows `question_index`, values `Total users`, filtered to `tile_quiz_question_view`.

### Returning players ("Retention")

- **Cohort exploration**: Cohort inclusion `First touch`, Return criteria **Event** `play_start`, granularity **Weekly**, calculation **Standard**. Each row is the players who first came that week; each cell is the share who started a game again *n* weeks later.
- **Free form** with rows `player_type` and values `Total users`, `play_hand_end` event count (Event count with a filter on the event): how much of the play comes from returning players. GA4's built-in `New / established` dimension also works, but counts visits, not games.
- **Segment overlap** of three segments (Users with `play_start`; with `play_playback_view`; with `play_coach_detail`) shows whether players use the coach and playback together.

### How the game is used ("Game settings")

Free form, filtered to `Event name` = the event shown:

| Question | Rows | Event |
| --- | --- | --- |
| Which coach level do people pick? | `detail` | `play_coach_detail` |
| Which strategies coach? | `strategy` | `play_set_coach_strategy` |
| Coach on, feedback or off at the start? | `coach` | `play_start` |
| Practice or payout? | `mode` | `play_start` |
| How do hands end? | `result` | `play_hand_end` |
| Where do playbacks come from? | `source` | `play_playback_view` |
| Theme changes | `theme` | `play_set_theme` |
| Links out of the site | `link_type`, then `link_domain` | `outbound_click` |
| Offline and the installed app | Event name | `offline_ready`, `app_install_prompt`, `app_installed`, `app_open_installed` |

## 4. A weekly report in the Library

To keep the numbers one click from the home page: **Reports › Library › Create new report › Create detail report › Events** (blank template), name it "Play", filter it to the events `play_start`, `play_hand_end`, `play_game_over`, `play_playback_view`, `play_lesson_complete`, save, and add it to the **Engagement** collection with **Edit collection**. Admin access is needed to edit the Library.

## How to read the numbers

- **Users, not events**, for "how many people": an event fires many times per person (`play_hand_end` once a hand). Use `Total users` for reach, `Event count` for volume.
- **Hands per player**: `play_hand_end` event count ÷ `play_start` total users.
- **Win rate**: `play_hand_end` with `result` = `win` ÷ all `play_hand_end`, with `lesson` = `false`.
- **Offline**: `offline_ready` counts browsers that saved the site for offline, once each version. A new version is a new save, so it rises with each release.
- **Thresholds**: GA4 hides small counts (Google signals data thresholds). If a breakdown says data is withheld, widen the date range, or set **Admin › Data display › Reporting identity** to **Device-based**.
- **Local testing** never reaches GA (see the [README](README.md#testing)), so nothing from development needs filtering out.
- **Data retention**: explorations only reach back as far as **Admin › Data collection and modification › Data retention** allows: 2 months by default. 14 months is the maximum for a standard property.

## Checklist for the account owner

1. Register the 2 user-scoped and 22 event-scoped dimensions and the 3 metrics in section 1.
2. Mark the 5 key events in section 2.
3. Set data retention to 14 months.
4. Build the five explorations in section 3.
5. Optional: the Library report in section 4.
