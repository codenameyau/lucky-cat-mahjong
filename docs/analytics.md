# Analytics events

Google Analytics 4 events fired by the site. Name, Instagram and zip code are never sent.

## Homepage

Each call to action fires two events, both with a `location` parameter:

- a **unique** event so it can be tracked individually: `book_session_hero`, `book_session_submit`, `instagram_message_hero`, `instagram_message_mobilebar`, `instagram_message_quotenote`, `instagram_profile_header`, `instagram_profile_cta`, `email_click_cta`, `email_click_mobilebar`, `email_click_quotenote`
- a **unified** channel event so totals are easy to read across the whole site — `email_click` (every email action, including the booking form), `instagram_message` (every Instagram DM action), and `instagram_profile` (every Instagram profile/follow click). The unified events include a `source_event` parameter identifying which specific call to action fired it.

## Header

On every page:

| Event | Parameters |
| --- | --- |
| `nav_click` | `link`, `page` |
| `nav_toggle_click` | `page` |

## Personality quiz

| Event | Parameters |
| --- | --- |
| `tile_quiz_start`, `tile_quiz_submit_click`, `tile_quiz_info_back_click` | |
| `tile_quiz_start_click` | `location` |
| `tile_quiz_question_view`, `tile_quiz_back_click` | `question_index` |
| `tile_quiz_answer_click`, plus one per answer: `tile_quiz_q1_a1` to `tile_quiz_q12_a4` | `question_index`, `answer_index`, `answer_label` |
| `tile_quiz_skill_click` | `skill_level` |
| `tile_quiz_complete`, `tile_quiz_view_shared`, `tile_quiz_locked_view` | `tile` |
| `tile_quiz_submit` | `tile`, `skill_level` |
| `tile_quiz_share_click`, `tile_quiz_download_click` | `tile` |
| `tile_quiz_share` | `tile`, `method` |
| `tile_quiz_gallery_click`, `tile_quiz_relation_click`, `tile_quiz_returning_click` | `tile` |
| `tile_quiz_cta_click` | `link` |

Each answer's own event counts how often it was clicked, with no GA4 setup needed. The numbers count from 1 in the order of `QUESTIONS` in `js/tile-quiz.js`, so `tile_quiz_q1_a3` is the first question's third answer. Going back and answering again counts as another click.

## Play Mahjong

Every button outside the hand itself is tracked. Discards and claims at the table aren't.

| Event | Parameters |
| --- | --- |
| `play_start`, `play_resume` | `spicy`, `mode`, `coach`, `speed`, `coach_strategy`, `strategies` |
| `play_hand_end` | `result`, `faan` |
| `play_game_over` | `hands`, `wins` |
| `play_start_click`, `play_mode_select` | `mode` |
| `play_resume_click`, `play_restart`, `play_copy_seed` | |
| `play_open_rules`, `play_close_rules`, `play_open_strategies`, `play_close_strategies` | |
| `play_menu_open`, `play_menu_resume_click`, `play_menu_restart_click`, `play_menu_quit_click` | |
| `play_fullscreen_click`, `play_show_hands_click`, `play_next_hand_click`, `play_see_results_click`, `play_again_click`, `play_end_quit_click` | |
| `play_rule_click` | `hand` |
| `play_credit_click` | `link` |
| `play_set_sound` | `sound` |
| `play_set_coach` | `coach` |
| `play_set_coach_strategy` | `strategy` |
