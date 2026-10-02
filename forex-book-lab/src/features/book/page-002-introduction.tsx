import { LessonPage } from "./lesson-page";

const paragraphs = [
  "Let's face it: stepping into the world of Forex trading is, for many, a significant leap out of their comfort zone. But as you hold this book in your hands, you're about to embark on an exciting journey. You're one decision away from transforming your financial destiny. A voyage that will, if embraced with determination and the right mindset, lead you to the discovery of unprecedented opportunities that the world of foreign exchange — Forex — has to offer.",
  "Just like you, I was once a beginner, stepping into the uncharted territory of Forex trading. The charts seemed perplexing, the terminologies appeared confusing, and the process felt daunting. I remember thinking, if only there was a guide, a mentor, a book that could offer the core essentials for someone just starting their journey in Forex. That's the motivation behind \"All You Should Know About Forex.\" This book is designed for you, the newbie, the Forex novice who is hungry for knowledge and eager to establish a solid foundation in the world of Forex trading.",
  "The pages that follow contain everything you need to understand what Forex is and how it works. It's not merely about acquiring theoretical knowledge; it's about practical learning. You will grasp how to read charts, understand terminologies, and comprehend trading strategies. Every chapter, every page is structured to help you comprehend complex concepts with ease.",
  "But remember, this is just the beginning. The real magic happens when you start implementing what you learn. This book will provide you with a solid foundation, but you must build upon it. Embrace continuous learning, be patient, take calculated risks, and persist despite the challenges.",
  "This book will not make you an overnight millionaire. No honest book would ever promise that. What it will do, however, is provide you with the knowledge, strategies, and confidence necessary to step into the Forex world and begin trading.",
  "So, are you ready? Ready to step out of your comfort zone and explore the limitless opportunities Forex has to offer? If you are, then turn the page. Your journey towards Forex mastery starts here, starts now.",
  "Welcome aboard! Your financial future awaits..."
];

const takeaways = [
  {
    title: "초보자를 전제로 시작",
    body: "차트와 용어가 낯선 사람을 대상으로 기초를 쌓는 책이라는 점을 먼저 분명히 한다.",
  },
  {
    title: "이론만이 아니라 적용",
    body: "차트 읽기, 용어 이해, 전략 학습처럼 실제로 써먹는 학습을 강조한다.",
  },
  {
    title: "한 번에 끝나는 학습이 아님",
    body: "책은 출발점이며 지속적인 학습, 인내, 계산된 위험 감수, 반복 적용이 필요하다고 말한다.",
  },
  {
    title: "빠른 부를 약속하지 않음",
    body: "단기간에 부자가 된다는 약속을 명시적으로 부정하고 지식과 전략, 자신감 형성을 목표로 둔다.",
  },
];

export function Page002Introduction() {
  return (
    <LessonPage
      page={2}
      title="INTRODUCTION"
      quote="Life begins at the end of your comfort zone."
      quoteAuthor="Neale Donald Walsch"
      paragraphs={paragraphs}
      takeaways={takeaways}
      previousHref="/book/1"
      nextHref="/book/3"
      nextLabel="Page 3"
    />
  );
}
