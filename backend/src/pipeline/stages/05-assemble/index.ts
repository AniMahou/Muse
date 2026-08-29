import type { ObservationCore } from "@shared/observation.schema";
import type { Annotations } from "@shared/stage-io";
import { DEFAULT_LLM_MAX_TOKENS } from "@/pipeline/ports";
import type { ILlmProvider } from "@/pipeline/ports";
import { buildAssemblySchema, vocabularyFrom } from "./schema";
import { SYSTEM_PROMPT, renderUserPrompt } from "./prompt";
import type { AssembleStageInput, AssembleStageOptions, AssembleStageOutput } from "./types";

/** Quantities are floats; compare with a tolerance rather than by identity. */
const QUANTITY_EPSILON = 1e-6;

/** What the model returns: an observation plus the mention it answers. */
type Attributed = ObservationCore & { mentionIndex: string | null };

/**
 * Stage 5 — assemble annotations into observations.
 *
 * The only stage that calls a language model, and it is deliberately given
 * the narrowest job in the pipeline: decide how many observations a recording
 * contains, which mentions belong to which, and what each one MEANS. It never
 * identifies a product or an outlet — stages 3 and 4 already did that, and
 * the response schema is rebuilt per clip so that naming anything outside
 * their candidates is not expressible.
 *
 * Numbers get a second guard. The schema cannot constrain a float the way it
 * constrains an identifier, so any quantity or price the model returns is
 * checked against what the grammar actually parsed and dropped if it does not
 * appear there. A model that quietly converts eighteen pieces into one and a
 * half dozen — or invents a plausible number for a field nobody spoke — is
 * the most expensive failure this system can have, and it is not one the
 * schema alone can prevent.
 */
export class AssembleStage {
  readonly name = "05-assemble";

  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly reasoningEffort: AssembleStageOptions["reasoningEffort"];

  constructor(
    private readonly llm: ILlmProvider,
    opts: AssembleStageOptions = {},
  ) {
    this.temperature = opts.temperature ?? 0;
    this.maxTokens = opts.maxTokens ?? DEFAULT_LLM_MAX_TOKENS;
    this.reasoningEffort = opts.reasoningEffort;
  }

  async run(input: AssembleStageInput): Promise<AssembleStageOutput> {
    const { transcript, annotations } = input;

    const vocab = vocabularyFrom(annotations);
    const schema = buildAssemblySchema(vocab);
    const user = renderUserPrompt(transcript, annotations, vocab);

    const { data } = await this.llm.complete({
      system: SYSTEM_PROMPT,
      user,
      schema,
      schemaName: "MuseAssembly",
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      ...(this.reasoningEffort ? { reasoningEffort: this.reasoningEffort } : {}),
    });

    const attributed = data.observations as Attributed[];
    const observations = attributed.map(({ mentionIndex: _drop, ...core }) => core);

    return {
      ...this.enforceNumbers(observations, annotations),
      unattributedMentions: unclaimedMentions(attributed, annotations),
    };
  }

  /**
   * Drop any number the grammar did not actually parse.
   *
   * Identity fields are already safe by construction; numbers are not. This
   * keeps stage 2 the single source of truth for every quantity and price in
   * the system, so a value on a dashboard can always be traced to a specific
   * span of speech.
   */
  private enforceNumbers(
    observations: ObservationCore[],
    annotations: Annotations,
  ): Omit<AssembleStageOutput, "unattributedMentions"> {
    const allowedValues = new Set(annotations.quantities.map((q) => q.value));
    const rejected: AssembleStageOutput["rejectedValues"] = [];

    const cleaned = observations.map((obs) => {
      const out = { ...obs };

      if (out.quantity !== null && !isAllowed(out.quantity, allowedValues)) {
        rejected.push({
          field: "quantity",
          value: out.quantity,
          reason: "not present in parsed quantities",
        });
        out.quantity = null;
        out.unit = null;
      }

      // A price delta may legitimately be negative where the parsed quantity
      // was positive ("পাঁচ টাকা কম" is 5, meaning -5), so compare magnitudes.
      if (out.priceDelta !== null && !isAllowed(Math.abs(out.priceDelta), allowedValues)) {
        rejected.push({
          field: "priceDelta",
          value: out.priceDelta,
          reason: "not present in parsed quantities",
        });
        out.priceDelta = null;
      }

      return out;
    });

    return { observations: cleaned, rejectedValues: rejected };
  }
}

/**
 * Product mentions the model was shown and then answered for nobody.
 *
 * This is the measurement that motivated `mentionIndex`. Comparing counts
 * cannot tell a merged answer from an honestly short one; comparing claims
 * can.
 */
function unclaimedMentions(
  observations: Attributed[],
  annotations: Annotations,
): AssembleStageOutput["unattributedMentions"] {
  const claimed = new Set(observations.map((o) => o.mentionIndex).filter((m) => m !== null));
  return annotations.skus
    .map((ann, index) => ({ index, raw: ann.raw }))
    .filter((m) => !claimed.has(String(m.index)));
}

function isAllowed(value: number, allowed: Set<number>): boolean {
  for (const a of allowed) if (Math.abs(a - value) < QUANTITY_EPSILON) return true;
  return false;
}
