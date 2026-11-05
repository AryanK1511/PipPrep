# CELPIP-General Writing: research and implementation

Checked against official CELPIP sources on **November 5, 2026**. Readline is independent practice software; its prompts are original and its estimates are not official scores.

## Format and interface

The [current format page](https://www.celpip.ca/test-format-scoring/) lists **53 minutes**, with Task 1, Writing an Email, and Task 2, Responding to Survey Questions. Use the current page rather than older guides that list 53–60 minutes. The [2026 Writing Pro study pack](https://www.celpip.ca/wp-content/uploads/2026/03/Writing-Pro-Target-9-Study-Pack-2026.pdf), page 8, specifies **27 minutes for Task 1 and 26 minutes for Task 2**.

The [official score comparison chart](https://www.celpip.ca/score-comparison-chart/) contains example instructions asking for **about 150–200 words per task**. An email addresses a situation and requested points for a specified reader. A survey asks the writer to choose between two options and explain the preference. Neither opinion is an answer key.

[Official writing advice](https://www.celpip.ca/blog/study-strategies-writing/) confirms computer delivery, a word counter, and automatic spellcheck. It allows some flexibility around the suggested length, while noting that significant deviations can affect performance. No fixed deduction or universal score cap is specified there. Planning and proofreading are recommended; the time budgets for those activities are advice, not extra timed sections.

Readline provides a two-pane prompt and plain-text editor, live word count, browser spellcheck, original starter tasks, generated prompts, and timed or untimed practice. Its token counter treats contractions and hyphenated words as single words; it does not claim to reproduce the official counter exactly. Browser spellcheck depends on browser language support and can differ from the test implementation. Tasks lock on advance or expiry. As in the existing Reading practice, deadlines are enforced on the server and continue while the browser is closed.

## Rating and feedback

The [official performance standards](https://www.celpip.ca/wp-content/uploads/2023/05/CELPIP-Performance-Standards.pdf) identify four dimensions:

| Dimension | Evidence to inspect |
| --- | --- |
| Content / Coherence | Idea development, organization, supporting detail |
| Vocabulary | Range, natural use, precision, accuracy |
| Readability | Paragraphing, transitions, sentence control, spelling, punctuation |
| Task Fulfillment | Relevance, completeness, audience/tone, approximate word count |

The [rating procedure](https://www.celpip.ca/take-celpip/test-results/) says Writing performances receive four to six independent raters. Ratings are transformed into a CELPIP level through a standard-setting process. An app cannot reproduce that process merely by averaging four invented scores out of 12. Public descriptors and analyzed examples are useful qualitative anchors, not a public numerical conversion algorithm.

Readline therefore returns a holistic **estimated range**, plus separate task estimates and dimension feedback. The skill assesses the submitted language, quotes it exactly, reviews every prompt requirement, gives targeted corrections, and supplies an illustrative revision. The original submission remains unchanged. A single-task drill has no component estimate. Under 30 words per task is a conservative application threshold for withholding estimates, not an official CELPIP scoring rule. Blank or unassessable work receives no invented score. AI-disabled practice retains responses and word-count checks without pretending to grade them.

## AI skill and safeguards

[The reusable evaluator skill](.agents/skills/celpip-writing/SKILL.md) is bundled into the server assessment prompt. Its level anchors paraphrase public descriptors. The application also supplies the exact task, response, deterministic word count, and elapsed time. The model cannot use external tools. Prompt text and student responses are untrusted data, including any instruction to change the grade.

Structured results are validated before storage: task order, all four distinct dimensions, coverage of every requirement, ordered score ranges, verbatim evidence and correction substrings, appropriate null estimates, and 150–200-word illustrative revisions. Invalid feedback can be retried without losing submissions. These checks detect malformed or unsupported evidence; they do not certify that an AI judgment matches human raters. Claims of calibrated accuracy would require a separately authorized study using independently scored responses.

Writing uses the existing private cookie and same-origin mutation checks. SQLite migration v2 adds writing tables without rewriting Reading records. Draft revisions reject conflicting tab updates. Failed saves retain a browser backup where storage is available; expired tasks retain the last accepted server save and expose any different local draft separately, outside the scored submission. Generated prompt and coaching requests share the existing concurrency limits and AI configuration.
