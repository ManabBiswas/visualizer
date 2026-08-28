// Anki basic-import export: one `question<TAB>answer` pair per line.
// Tabs/newlines inside fields are replaced so the import never breaks.

export type AnkiCard = { question: string; answer: string | null };

const NO_ANSWER = "(no answer recorded - fill in during review)";

function escapeField(text: string): string {
  return text.replace(/\t/g, " ").replace(/\r?\n/g, " <br> ").trim();
}

export function cardsToAnkiTxt(cards: AnkiCard[]): string {
  return cards
    .map((c) => `${escapeField(c.question)}\t${c.answer?.trim() ? escapeField(c.answer) : NO_ANSWER}`)
    .join("\n");
}
