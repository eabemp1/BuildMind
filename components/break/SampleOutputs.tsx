/**
 * Three made-up examples of what a stress test says, so a visitor can see the shape of the answer before typing.
 * Each is labelled as an example. None is a real founder's run and none carries a score.
 */
export const SAMPLES = [
  {
    idea: "A booking app for independent barbers in Accra",
    weakest: "Can you reach them?",
    why: "Barbers already take bookings by WhatsApp and have no reason to install anything. Reaching them one shop at a time is slow.",
    first: "Visit five barbershops this week and ask how they take bookings today. Write down what they say, word for word.",
  },
  {
    idea: "An AI tool that summarises weekly team meetings",
    weakest: "How is it different?",
    why: "Meeting tools from big vendors already ship summaries, so a new entrant has to be better at one narrow job.",
    first: "Pick one team type, such as sales stand-ups, and offer to summarise their next three meetings by hand. See if they ask for more.",
  },
  {
    idea: "A marketplace for second-hand textbooks at one university",
    weakest: "Is the problem real?",
    why: "Students may swap books in group chats for free. If so, nobody will pay or install a new app for it.",
    first: "Ask 10 students in one faculty how they got their books last term and what it cost them.",
  },
];

export default function SampleOutputs() {
  return (
    <section aria-label="Example stress tests" style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: "var(--bm-text)" }}>What an answer looks like</h2>
      <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: "0 0 14px", lineHeight: 1.5 }}>Three made-up ideas, written as examples. They are not real runs.</p>
      <div style={{ display: "grid", gap: 10 }}>
        {SAMPLES.map((s) => (
          <article key={s.idea} style={{ border: "1px solid var(--bm-border2)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", marginBottom: 8 }}>{s.idea}</div>
            <p style={{ fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55, margin: "0 0 6px" }}><strong>Weakest point: {s.weakest}</strong> {s.why}</p>
            <p style={{ fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55, margin: 0 }}><strong>First test:</strong> {s.first}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
