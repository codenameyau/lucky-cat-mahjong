# Play Mahjong background music

Tracks by Kevin MacLeod ([incompetech.com](https://incompetech.com)),
licensed under [Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Each was levelled to -23 LUFS (ITU-R BS.1770 integrated loudness, as EBU R128),
so no track plays louder than another, then re-encoded from the original MP3 to 48 kbps
HE-AAC (`.m4a`, `afconvert -f m4af -d aach@44100 -b 48000 -s 0`) to keep the site and the offline
download small. Nothing else was changed. `scripts/loudness.js` measures them.

Which tracks the game plays, and in what order, is `TRACKS` in `js/mahjong-music.js`:
each game plays the opening tracks first, then the mid game ones, then all of them
together, reshuffled each time round. Add one with `node scripts/add-music.js`
([docs/music.md](../../../docs/music.md)); it writes this file.

Credit, as shown on the play page:

> Music by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0.

| File | Track | Part | Instruments | Length | LUFS |
| --- | --- | --- | --- | --- | --- |
| `ishikari-lore.m4a` | [Ishikari Lore](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100192) | opening | Koto, Flute, Percussion | 2:44 | -23.0 |
| `shenyang.m4a` | [Shenyang](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600066) | opening | Erhu, Pipa, Yangqin, Percussion | 2:31 | -23.0 |
| `eastern-thought.m4a` | [Eastern Thought](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100682) | mid | Strings, Metals, Percussion | 4:22 | -23.0 |
| `ripples.m4a` | [Ripples](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100691) | mid | Koto | 3:25 | -23.0 |
| `senbazuru.m4a` | [Senbazuru](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100821) | mid | Koto, Synth, Cello, Flute | 1:34 | -23.0 |
| `finding-movement.m4a` | [Finding Movement](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100693) | mid | Koto, String Ensemble | 1:56 | -23.0 |
| `guzheng-city.m4a` | [Guzheng City](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2100001) | mid | Guzheng, Percussion (Dhol) | 1:54 | -23.0 |
| `mountain-emperor.m4a` | [Mountain Emperor](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700012) | mid | Taiko Drums, Gamelan | 3:20 | -23.0 |
| `river-fire.m4a` | [River Fire](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700055) | mid | Drums, Hang Drum, Bells, Flute | 6:40 | -23.0 |
