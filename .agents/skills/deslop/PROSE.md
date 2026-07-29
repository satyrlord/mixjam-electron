# Prose Slop

Preserve meaning and intentional voice. Remove prose that makes the next
reader reconstruct the point or that conflicts with the surrounding document.

The mechanical checks below are what removes slop. The judgment checks that
follow them need context. A checker cannot certify judgment, and slop is not
about judgment.

## Mechanical checks

Apply these to documentation, READMEs, pull-request text, error messages,
release notes, and comments. Do not apply them to code, identifiers, or command
syntax. See the writing-style rules in [AGENTS.md](../../../AGENTS.md) for the
full standard.

- Sentences over 20 words in an instruction, or over 25 in description
- Semicolons where two sentences read better
- Contractions
- Passive voice where the actor is known
- An "-ing" main verb where a simple tense works
- A nominalization ("perform an analysis") where a verb works
- A phrasal verb ("spin up") where a plain verb works
- A long word where a short one works: utilize, facilitate, ensure, prior to,
  subsequent to, regarding, obtain, demonstrate, additionally, furthermore
- Marketing adjectives: seamless, robust, powerful, cutting-edge, effortless,
  world-class, next-generation, revolutionary
- One thing named two ways within the same document set
- Non-American spelling
- Steps written as prose where a numbered list, one action per item, works
- A command written before its condition

Fix each hit. Do not rewrite the surrounding sentence beyond the fix.

## Empty framing

- Throat-clearing, hand-holding, and signposting before the actual point
- Rhetorical questions or dramatic fragments used only for emphasis
- Pull-quote sentences and vague declarations without concrete information
- Meta-commentary about what the document will say instead of saying it
- Filler transitions that headings already provide

## Inflated style

- Business or trend jargon standing in for a specific claim
- Repeated binary contrasts or negative lists that restate one conclusion
- Lazy absolutes unsupported by the document's evidence
- Metronomic list and sentence patterns that make unrelated ideas sound equal
- Adverbs, passive constructions, or emphatic phrases that obscure the actor
  or claim

Do not ban a word class or grammatical voice. Rewrite only when the sentence
becomes more precise and remains consistent with sibling documents.

## Stale information

- Historical notes whose constraint no longer applies
- TODOs with no owner, condition, or live work item
- Descriptions of files, commands, or behavior that no longer exist
- Polished summaries that omit the evidence needed to act

Retain history when it explains a current constraint or prevents a rejected
decision from being reintroduced; move it to the owning durable document when
necessary.
