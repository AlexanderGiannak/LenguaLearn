# Content sources

`content/` holds the content pipeline's working files (spec: Content pipeline). They are data,
not code, and nothing here reaches students until it has been through the status flow.

## candidates.csv and dropped.csv (step 1, word list)

Built by `npm run content:word-list` from two openly licensed sources:

| Source | What it gives | License |
|---|---|---|
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave, `content/2018/es/es_50k.txt`, counted from the [OpenSubtitles 2018](https://opus.nlpl.eu/OpenSubtitles2018.php) corpus | How often each spelled form appears in film and TV subtitles | Content CC BY-SA 4.0, code MIT |
| [Wiktionary](https://en.wiktionary.org/), Spanish entries as extracted by [kaikki.org](https://kaikki.org/dictionary/Spanish/) (wiktextract) | Which dictionary word each form belongs to, parts of speech, inflection tables, sense tags | CC BY-SA 4.0 and GFDL, as Wiktionary |

Because both sources are share-alike, **candidates.csv and dropped.csv are licensed CC BY-SA 4.0**,
with attribution to the two sources above. They are working files and are not published with
the app. The word pages, examples and hooks are written fresh by the generation step and are not
derived from either source; frequency ranks are only used to order and level the words.

Subtitles were chosen because they reflect spoken, everyday Spanish, which suits learners.
No commercial frequency dictionary is used.

### How the list is built

1. Each spelled form's count goes to the dictionary words it belongs to. A form that belongs to
   one word gives it the whole count. For an ambiguous form, a function word keeps the count
   ("como" is rarely "I eat"); otherwise it is shared by evidence, so most of "vino" goes to
   venir and most of "casa" to the noun.
2. Only real inflections count as forms: plurals, adjective endings and conjugations. Other
   words in Wiktionary's tables (madre lists padre, bueno lists mejor) do not.
3. Alternative spellings and apocopic adjectives join their main word (quizás → quizá,
   buen → bueno). Verb forms that Wiktionary also lists only as interjections ("vamos",
   "sabes") are senses of the verb.
4. Left out as standalone cards: articles, prepositions, pronouns and conjunctions (the spec's
   cut), contractions, names and affixes. A word used mostly as a function word is left out
   even if it has a minor content use ("a" is also an interjection). These are in
   `dropped.csv`.
5. Vulgar, offensive and derogatory senses are never taught. A word with only such senses is
   dropped (`unsuitable` in dropped.csv); a word with some, such as coger, is kept with the
   note "has vulgar or offensive senses: leave them out", which generation follows.
6. Levels are bands of 500 by rank. Senses are ranked later, during generation.

### Columns

`rank, lemma, pos, level, count, themes, notes`. `pos` lists the parts of speech that can be
taught, separated by `|`. `themes` is empty for the owner to fill in. `notes` says when a
word also has dropped uses, when its count was shared with another word, and when it has
senses to leave out.

### Editing by hand

Delete rows to leave words out, reorder rows to change rank, and add themes. Generation reads
the file as edited. Rerunning `npm run content:word-list` overwrites both files, so keep
hand edits in a copy or commit them first.
