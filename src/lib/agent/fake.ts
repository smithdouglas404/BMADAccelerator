import { promises as fs } from "fs";
import path from "path";
import type { UseCase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { workspacePath } from "@/lib/workspace";
import type { RunTally } from "./tools";

// A scripted stand-in for the agents, used only by automated tests
// (BACC_FAKE_AGENT=1 with no ANTHROPIC_API_KEY). It drives the same UI paths:
// messages in an agent's name, one question, a stage change, and a BMAD-format
// ticket tree that the board reads through Sofia's tickets.py.
export async function fakeAgentTurn(uc: UseCase, prompt: string, tally: RunTally) {
  const say = async (agent: string, content: string) => {
    tally.spoke++;
    await prisma.message.create({
      data: { useCaseId: uc.id, role: agent === "concierge" ? "concierge" : "bmad-agent", agent, content },
    });
  };
  const userTurns = await prisma.message.count({ where: { useCaseId: uc.id, role: "user" } });
  if (prompt.includes("finished intake")) {
    await say("concierge", "Thanks, I've read everything you gave me. You'll start with Mary, BMAD's analyst.");
    await prisma.useCase.update({ where: { id: uc.id }, data: { stage: "clarify", activeAgent: "analyst" } });
    await say("analyst", "Who will use this first, and what should they be able to do on day one?\n\nFor example: \"Visitors open the page and see a greeting.\"");
    return;
  }
  if (prompt.startsWith("Generate finished")) {
    await say("ux", "I've noted the screen layout from the generated app in the UX notes.");
    return;
  }
  if (userTurns >= 2) {
    const init = workspacePath(uc.slug, "_bmad-output", uc.initiative);
    const epicDir = path.join(init, "tickets", "epic-greeting");
    await fs.mkdir(path.join(epicDir, "tickets"), { recursive: true });
    await fs.writeFile(
      path.join(init, "tickets", "tickets.toml"),
      `[[epic]]\nid = 1\nslug = "epic-greeting"\ntitle = "Visitors are greeted"\ndescription = "A visitor opens the app and is greeted."\n`,
    );
    await fs.writeFile(
      path.join(epicDir, "epic-greeting.md"),
      `---\nid: 1\ntype: epic\ntitle: "Visitors are greeted"\nparent: ${uc.initiative}\n---\n\n# Visitors are greeted\n`,
    );
    await fs.writeFile(
      path.join(epicDir, "tickets", "tickets.toml"),
      `[[entry]]\nid = 1\ntype = "story"\ntitle = "Show a Hello World page"\nverify = "Open the app and see Hello World"\nafter = []\nhitl = false\nrisk = "low"\n\n[[entry]]\nid = 2\ntype = "spike"\ntitle = "Choose the greeting style"\nafter = [1]\nunknown = "Should the greeting be formal or playful?"\n`,
    );
    await prisma.useCase.update({ where: { id: uc.id }, data: { stage: "plan", activeAgent: "po" } });
    await say("po", "I've broken the work into one epic with a story and a spike. They're on the board below.");
    return;
  }
  await say("analyst", "Got it. Is this what you mean: a single page that greets every visitor?");
}
