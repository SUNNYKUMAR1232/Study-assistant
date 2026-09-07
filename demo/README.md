# Demo inputs

Paste any of these into the composer. They are chosen to exercise different behaviour, not just to look good.

| File | Chars | What it demonstrates |
|---|---|---|
| `01-photosynthesis.txt` | 591 | The clean happy path. Same text as the app's **Use sample text** button. |
| `02-tcp-handshake.txt` | 704 | Dense technical prose with acronyms and state names — distractors have to be plausible. |
| `03-french-revolution.txt` | 721 | Dates and proper nouns. Good for spotting hallucination: every date in the output must appear in the input. |
| `04-thin-input.txt` | 54 | Barely any material. The prompt says *return fewer items rather than pad*, so asking for 20 cards here should produce far fewer. |
| `05-too-short.txt` | 13 | About as little as you can give it. There is no minimum length — only an empty box is rejected — so this generates, and the thin result is the point. |

## Things worth trying

**Check for hallucination.** Generate from `03-french-revolution.txt` and verify every date and name in the flashcards appears in the source. The app validates *shape*, never *truth* — this is the check it cannot do for you.

**Watch the cache.** Generate the same file twice. The second run returns instantly with no network request, because the result is cached against a hash of the input and settings.

**Push the padding rule.** Load `04-thin-input.txt` and ask for 20 flashcards and 15 questions. A model that pads will invent facts; this one should return a short set.

**Test the length cap.** Paste any of these repeatedly until the counter passes 12,000 characters. The submit button disables and the counter turns red before a request is made. That cap is the only length rule; there is no minimum.
