import { redirect } from "next/navigation";
import { LitUpApp } from "@/components/LitUpApp";
import { currentLearner } from "@/lib/auth/session";
import { parseTab } from "@/lib/tabs";
import { crashCourseSource, randomPicks, WHITELIST_META } from "@/lib/jelajahi/whitelist";

export default async function Home(props: PageProps<"/">) {
  const auth = await currentLearner();
  if (auth.status !== "ok") redirect("/masuk");

  const { tab } = await props.searchParams;
  const topics = crashCourseSource.listTopics().map(({ name, slug, count }) => ({ name, slug, count }));
  const picks = randomPicks(6);

  return (
    <LitUpApp
      email={auth.learner.email}
      initialTab={parseTab(tab)}
      topics={topics}
      picks={picks}
      whitelistTotal={WHITELIST_META.total}
    />
  );
}
