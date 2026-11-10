import css from "@/app/break/break.module.css";

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
    <section aria-label="Example stress tests">
      <h2 className={css.h2}>What an answer looks like</h2>
      <p className={css.muted}>Three made-up ideas, written as examples. They are not real runs.</p>
      <div className={css.samples}>
        {SAMPLES.map((s) => (
          <article key={s.idea} className={css.sample}>
            <h3>{s.idea}</h3>
            <p><strong>Weakest check: {s.weakest}</strong> {s.why}</p>
            <p><strong>First test:</strong> {s.first}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
